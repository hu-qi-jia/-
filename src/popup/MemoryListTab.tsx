/**
 * 记忆列表页(P3,设计文档 §7):问答记录流,展开看回复;
 * 操作:设为金标准(按回复)/ 删除单条 / 关键词筛选 / 剩余保留天数标注。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThemeTokens } from '../ui/theme'
import { sendMessage } from '../utils/message-passing'
import type {
  AddGoldenResponse,
  DeleteQaResponse,
  GetMemoryListResponse,
  MemoryListItem,
} from '../types/messages'
import { filterQaRecords, remainingDays } from '../utils/panelLogic'
import { Btn, Notice, formatTs, type NoticeMsg } from './ui-bits'

export function MemoryListTab({
  tk,
  retentionDays,
  onDataChanged,
}: {
  tk: ThemeTokens
  retentionDays: number
  onDataChanged: () => Promise<void> | void
}) {
  const [items, setItems] = useState<MemoryListItem[]>([])
  const [keyword, setKeyword] = useState('')
  // 默认全部展开(问题+回复直接可见);记录用户手动折叠的条目
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [msg, setMsg] = useState<NoticeMsg>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const resp = await sendMessage<GetMemoryListResponse>({ type: 'GET_MEMORY_LIST' })
      if (resp.payload.error) {
        setMsg({ ok: false, text: `读取失败:${resp.payload.error}` })
      } else {
        setItems(resp.payload.items)
      }
    } catch (err) {
      setMsg({ ok: false, text: `读取失败:${String(err)}` })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => filterQaRecords(items, keyword), [items, keyword])
  const now = Date.now()

  const setGolden = async (item: MemoryListItem, replyId: string, text: string) => {
    try {
      const resp = await sendMessage<AddGoldenResponse>({
        type: 'ADD_GOLDEN',
        payload: {
          question: item.question,
          answer: text,
          sourceRecordId: item.id,
          sourceReplyId: replyId,
        },
      })
      const p = resp.payload
      if (p.error) setMsg({ ok: false, text: `设金失败:${p.error}` })
      else if (p.exists) setMsg({ ok: true, text: '相同问题的金标准已存在,未重复创建' })
      else setMsg({ ok: true, text: '已设为金标准(后台自动向量化)' })
    } catch (err) {
      setMsg({ ok: false, text: `设金失败:${String(err)}` })
    }
  }

  const deleteQa = async (id: string) => {
    try {
      const resp = await sendMessage<DeleteQaResponse>({
        type: 'DELETE_QA',
        payload: { id },
      })
      if (resp.payload.success) {
        setMsg({ ok: true, text: '已删除该条问答(含回复)' })
        await load()
        await onDataChanged()
      } else {
        setMsg({ ok: false, text: `删除失败:${resp.payload.error ?? '未知错误'}` })
      }
    } catch (err) {
      setMsg({ ok: false, text: `删除失败:${String(err)}` })
    }
    setConfirmDeleteId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="关键词筛选问题…"
        style={{
          width: '100%',
          padding: '7px 10px',
          borderRadius: 8,
          border: `1px solid ${tk.border}`,
          backgroundColor: tk.bgCard,
          color: tk.text,
          fontSize: 12,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />

      <Notice tk={tk} msg={msg} />

      {loading && <div style={{ fontSize: 12, color: tk.textMuted }}>读取中…</div>}
      {!loading && shown.length === 0 && (
        <div style={{ fontSize: 12, color: tk.textTertiary, padding: '14px 0', textAlign: 'center', lineHeight: 1.7 }}>
          {items.length === 0 ? (
            <>
              还没有记录。打开拼多多聊天页,
              <br />
              与买家对话后会自动捕获问答。
            </>
          ) : (
            '没有匹配的问题'
          )}
        </div>
      )}

      {shown.map((item) => {
        const days = remainingDays(item.questionTs, now, retentionDays)
        const expanded = !collapsedIds.has(item.id)
        return (
          <div
            key={item.id}
            style={{
              border: `1px solid ${tk.border}`,
              borderRadius: 10,
              backgroundColor: tk.bgCard,
              padding: '8px 10px',
            }}
          >
            {/* 问题行 */}
            <div
              onClick={() =>
                setCollapsedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(item.id)) next.delete(item.id)
                  else next.add(item.id)
                  return next
                })
              }
              style={{ cursor: 'pointer' }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {item.question}
              </div>
              <div style={{ fontSize: 10.5, color: tk.textMuted, marginTop: 3 }}>
                {formatTs(item.questionTs)} · {item.replyCount} 条回复 ·{' '}
                <span style={{ color: days <= 7 ? tk.errorText : undefined }}>
                  剩 {days} 天
                </span>
              </div>
            </div>

            {/* 展开区:回复列表 */}
            {expanded && (
              <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {item.replies.length === 0 && (
                  <div style={{ fontSize: 11.5, color: tk.textTertiary }}>无回复(未结段)</div>
                )}
                {item.replies.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      borderTop: `1px solid ${tk.border}`,
                      paddingTop: 6,
                      display: 'flex',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        fontSize: 11.5,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: tk.text,
                      }}
                    >
                      {r.text}
                    </div>
                    <Btn tk={tk} variant="primary" onClick={() => void setGolden(item, r.id, r.text)} title="把该问题+此回复设为金标准">
                      设金
                    </Btn>
                  </div>
                ))}
                {/* 删除单条(内联二次确认) */}
                <div style={{ borderTop: `1px solid ${tk.border}`, paddingTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {confirmDeleteId === item.id ? (
                    <>
                      <span style={{ fontSize: 11, color: tk.errorText }}>确认删除该问答及其全部回复?</span>
                      <Btn tk={tk} variant="danger" onClick={() => void deleteQa(item.id)}>
                        删除
                      </Btn>
                      <Btn tk={tk} variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        取消
                      </Btn>
                    </>
                  ) : (
                    <Btn tk={tk} variant="danger" onClick={() => setConfirmDeleteId(item.id)}>
                      删除此条
                    </Btn>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
