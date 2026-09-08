/**
 * handlePddIngest 会话解析与落盘胶水测试。
 * db/offscreen/settings 全 mock:只验证路由逻辑(会话解析 → 分段器 → hooks 调用)。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/background/db', () => {
  // 有状态最小 mock:addQaRecord 存入内存,getQaRecord 可读回(孤回复守卫需要)
  const qaStore = new Map<string, unknown>()
  return {
    db: {
      findLatestQaByHash: vi.fn(async () => undefined),
      addQaRecord: vi.fn(async (r: { id: string }) => {
        qaStore.set(r.id, r)
      }),
      getQaRecord: vi.fn(async (id: string) => qaStore.get(id)),
      hasReplyContent: vi.fn(async () => false),
      addReply: vi.fn(async () => undefined),
      recountReplyCount: vi.fn(async () => undefined),
      latestQaOfSession: vi.fn(async () => undefined),
      logError: vi.fn(async () => undefined),
    },
  }
})

vi.mock('../../../src/background/offscreen', () => ({
  queueEmbedding: vi.fn(),
}))

vi.mock('../../../src/background/settings', () => ({
  loadSettings: vi.fn(async () => ({
    directFillEnabled: false,
    simThreshold: 0.5,
    goldenThreshold: 0.4,
    retentionDays: 90,
    goldenPriorityEnabled: true,
  })),
}))

import { db } from '../../../src/background/db'
import type { PddCapturedEvent, PddIngestRequest } from '../../../src/types/messages'

type Ingest = (m: PddIngestRequest, tabId?: number) => Promise<{
  queued: number
  skipped: number
  detail?: string
}>

async function freshIngest(): Promise<Ingest> {
  vi.resetModules()
  const mod = await import('../../../src/background/pddCapture')
  const raw = mod.handlePddIngest
  return async (m, tabId) => {
    const resp = await raw(m, tabId)
    return resp.payload
  }
}

function msgEvents(sessionKey: string | undefined, level: 'event' | 'msg') {
  // 同一 sessionKey 分别按事件级 / 消息级两种形态构造
  const base = {
    source: 'dom' as const,
    role: 'buyer' as const,
    text: '这个能开发票吗?',
    msgId: `m-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
  }
  const ev: PddCapturedEvent =
    level === 'event'
      ? { kind: 'msg', sessionKey, buyerIdTail: sessionKey?.slice(-4), msg: base }
      : { kind: 'msg', msg: { ...base, sessionKey, buyerIdTail: sessionKey?.slice(-4) } }
  return [ev]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handlePddIngest: 会话解析', () => {
  it('★ 回归:事件级 sessionKey 的消息应进入分段器并落盘(DOM 路线真实形态)', async () => {
    const ingest = await freshIngest()
    const resp = await ingest({
      type: 'PDD_INGEST',
      payload: {
        events: [
          ...msgEvents('u1875210170836', 'event'),
          {
            kind: 'msg',
            sessionKey: 'u1875210170836',
            buyerIdTail: '0836',
            msg: {
              source: 'dom',
              role: 'agent',
              text: '可以的,支持电子发票。',
              msgId: 'a-1',
              ts: Date.now(),
            },
          },
        ],
      },
    })

    expect(resp.queued).toBe(2)
    expect(resp.skipped).toBe(0)
    expect(db.addQaRecord).toHaveBeenCalledTimes(1)
    expect(vi.mocked(db.addQaRecord).mock.calls[0][0]).toMatchObject({
      sessionKey: 'u1875210170836',
      buyerIdTail: '0836',
      question: '这个能开发票吗?',
    })
    expect(db.addReply).toHaveBeenCalledTimes(1)
  })

  it('消息级 sessionKey(net 形态)同样入段落盘', async () => {
    const ingest = await freshIngest()
    const mkMsg = (role: 'buyer' | 'agent', text: string, id: string) => ({
      source: 'dom' as const,
      role,
      text,
      msgId: id,
      ts: Date.now(),
    })
    const resp = await ingest({
      type: 'PDD_INGEST',
      payload: {
        events: [
          {
            kind: 'msg',
            msg: { ...mkMsg('buyer', '能便宜点吗?', 'nm-1'), sessionKey: 'u9999' },
          },
          {
            kind: 'msg',
            msg: { ...mkMsg('agent', '亲,已经是活动价了哦。', 'nm-2'), sessionKey: 'u9999' },
          },
        ],
      },
    })

    expect(resp.queued).toBe(2)
    expect(db.addQaRecord).toHaveBeenCalledTimes(1)
    expect(vi.mocked(db.addQaRecord).mock.calls[0][0]).toMatchObject({ sessionKey: 'u9999' })
  })

  it('无 sessionKey 且无来源 tab → nosession 跳过(守卫保留)', async () => {
    const ingest = await freshIngest()
    const resp = await ingest({
      type: 'PDD_INGEST',
      payload: { events: msgEvents(undefined, 'event') },
    })

    expect(resp.queued).toBe(0)
    expect(resp.skipped).toBe(1)
    expect(resp.detail).toContain('nosession=1')
    expect(db.addQaRecord).not.toHaveBeenCalled()
  })
})
