import { describe, it, expect } from 'vitest'
import {
  PddSegmenter,
  type AttachReplyCtx,
  type CloseQuestionCtx,
  type SegmenterHooks,
} from '../../../src/background/pddSegmenter'

interface FakeStore {
  closed: CloseQuestionCtx[]
  attached: AttachReplyCtx[]
  recent: Map<string, string>
}

/** 内存版 hooks:closeQuestion 总返回新 id 并记为"最近问答" */
function makeFake(): { store: FakeStore; hooks: SegmenterHooks } {
  const store: FakeStore = { closed: [], attached: [], recent: new Map() }
  const hooks: SegmenterHooks = {
    async closeQuestion(ctx) {
      store.closed.push(ctx)
      const id = `qa-${store.closed.length}`
      store.recent.set(ctx.sessionKey, id)
      return id
    },
    async attachReply(ctx) {
      store.attached.push(ctx)
    },
    async recentQaId(sessionKey) {
      return store.recent.get(sessionKey)
    },
  }
  return { store, hooks }
}

describe('PddSegmenter: 会话内问答分段状态机', () => {
  it('买家提问 → 客服回复:落一条问答并把回复挂上去', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '这个杯子能保温多久?', ts: 1000 })
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '12 小时以上哦。', ts: 4000 })
    await seg.settled()

    expect(store.closed).toHaveLength(1)
    expect(store.closed[0].question).toBe('这个杯子能保温多久?')
    expect(store.attached).toHaveLength(1)
    expect(store.attached[0]).toMatchObject({ qaId: 'qa-1', text: '12 小时以上哦。' })
  })

  it('客服回复前买家连发多条文本合并为一条问题(换行连接)', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '有货吗?', ts: 1000 })
    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '什么颜色好看?', ts: 3000 })
    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '粉色有吗?', ts: 5000 })
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '都有现货,粉色最受欢迎。', ts: 9000 })
    await seg.settled()

    expect(store.closed).toHaveLength(1)
    expect(store.closed[0].question).toBe('有货吗?\n什么颜色好看?\n粉色有吗?')
    expect(store.closed[0].firstTs).toBe(1000)
    expect(store.attached).toHaveLength(1)
  })

  it('同一文本重复推送不重复并入问题段', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '在吗?', ts: 1000 })
    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '在吗?', ts: 2000 }) // 网络重推
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '在的,请问有什么可以帮您?', ts: 3000 })
    await seg.settled()

    expect(store.closed[0].question).toBe('在吗?')
  })

  it('无未结问题时客服文本挂到本会话最近一条问答(开场/补发)', async () => {
    const { store, hooks } = makeFake()
    store.recent.set('s1', 'qa-0')
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '您好,欢迎光临~', ts: 1000 })
    await seg.settled()

    expect(store.closed).toHaveLength(0)
    expect(store.attached).toHaveLength(1)
    expect(store.attached[0]).toMatchObject({ qaId: 'qa-0', text: '您好,欢迎光临~' })
  })

  it('买家提问后 idle(3 分钟无动静):落为"无回复问题"', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '亲,能开发票吗?', ts: 1000 })
    await seg.onIdle('s1')
    await seg.settled()

    expect(store.closed).toHaveLength(1)
    expect(store.closed[0].question).toBe('亲,能开发票吗?')
    expect(store.attached).toHaveLength(0) // 无回复
  })

  it('leave 同样关闭未结问题段;重复 idle 不产生副作用', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '多久发货?', ts: 1000 })
    await seg.onLeave('s1')
    await seg.onIdle('s1') // 已无未结段 → no-op
    await seg.settled()

    expect(store.closed).toHaveLength(1)
    expect(store.attached).toHaveLength(0)
  })

  it('回复后新买家提问开启新段,两轮问答各自成对', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '问一', ts: 1000 })
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '答一', ts: 2000 })
    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '问二', ts: 3000 })
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '答二', ts: 4000 })
    await seg.settled()

    expect(store.closed).toHaveLength(2)
    expect(store.closed.map((c) => c.question)).toEqual(['问一', '问二'])
    expect(store.attached.map((a) => a.text)).toEqual(['答一', '答二'])
    expect(store.attached.map((a) => a.qaId)).toEqual(['qa-1', 'qa-2'])
  })

  it('多会话消息交错互不串段', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: 'A 的提问', ts: 1000 })
    seg.onMessage({ sessionKey: 's2', role: 'buyer', text: 'B 的提问', ts: 2000 })
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: 'A 的回复', ts: 3000 })
    seg.onMessage({ sessionKey: 's2', role: 'agent', text: 'B 的回复', ts: 4000 })
    await seg.settled()

    expect(store.closed).toHaveLength(2)
    expect(store.closed.map((c) => c.sessionKey).sort()).toEqual(['s1', 's2'])
    expect(store.attached.map((a) => a.text)).toEqual(['A 的回复', 'B 的回复'])
  })

  it('flushAll 收尾所有未结会话', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '遗留问题 1', ts: 1000 })
    seg.onMessage({ sessionKey: 's2', role: 'buyer', text: '遗留问题 2', ts: 2000 })
    await seg.flushAll()
    await seg.settled()

    expect(store.closed).toHaveLength(2)
  })

  it('事件未 await 全部连发也按序落盘(串行链)', async () => {
    const { store, hooks } = makeFake()
    const seg = new PddSegmenter(hooks)

    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '第一句', ts: 1000 })
    seg.onMessage({ sessionKey: 's1', role: 'buyer', text: '第二句', ts: 2000 })
    seg.onMessage({ sessionKey: 's1', role: 'agent', text: '回一句', ts: 3000 })
    await seg.settled()

    expect(store.closed).toHaveLength(1)
    expect(store.closed[0].question).toBe('第一句\n第二句')
  })
})
