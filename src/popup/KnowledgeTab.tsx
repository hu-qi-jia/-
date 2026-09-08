/**
 * 知识库页(P4-KB v1,设计文档 §7):人工维护的"标题+正文"话术卡列表。
 * 操作:新建(内联表单)/ 关键词筛选 / 编辑(标题实质变更才重嵌)/
 * 停用开关(停用不参与检索、不重嵌)/ 删除(内联二次确认)/ 填充 / 复制。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThemeTokens } from '../ui/theme'
import { sendMessage } from '../utils/message-passing'
import type {
  CreateKbResponse,
  DeleteKbResponse,
  FillInputResponse,
  GetPanelDataResponse,
  PanelKnowledge,
  UpdateKbResponse,
} from '../types/messages'
import { Btn, Notice, formatTs, type NoticeMsg } from './ui-bits'

const KB = '#10b981'

export function KnowledgeTab({
  tk,
  onDataChanged,
}: {
  tk: ThemeTokens
  onDataChanged: () => Promise<void> | void
}) {
  const [items, setItems] = useState<PanelKnowledge[]>([])
  const [keyword, setKeyword] = useState('')
  const [msg, setMsg] = useState<NoticeMsg>(null)
  const [loading, setLoading] = useState(true)

  // 内联交互状态(同一时刻至多一个激活)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const resp = await sendMessage<GetPanelDataResponse>({ type: 'GET_PANEL_DATA' })
      if (resp.payload.error) {
        setMsg({ ok: false, text: `读取失败:${resp.payload.error}` })
      } else {
        setItems(resp.payload.knowledge ?? [])
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

  const refresh = async () => {
    await load()
    await onDataChanged()
  }

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return items
    return items.filter((k) => k.title.toLowerCase().includes(kw) || k.content.toLowerCase().includes(kw))
  }, [items, keyword])

  const submitCreate = async () => {
    try {
      const resp = await sendMessage<CreateKbResponse>({
        type: 'CREATE_KB',
        payload: { title: newTitle, content: newContent },
      })
      if (resp.payload.error) setMsg({ ok: false, text: `新建失败:${resp.payload.error}` })
      else if (resp.payload.exists) setMsg({ ok: false, text: '已存在相同标题的知识条目' })
      else {
        setMsg({ ok: true, text: '已创建(后台自动向量化)' })
        await refresh()
      }
    } catch (err) {
      setMsg({ ok: false, text: `新建失败:${String(err)}` })
    }
    setCreating(false)
    setNewTitle('')
    setNewContent('')
  }

  const startEdit = (k: PanelKnowledge) => {
    setEditingId(k.id)
    setDraftTitle(k.title)
    setDraftContent(k.content)
    setConfirmDeleteId(null)
  }

  const submitEdit = async () => {
    if (!editingId) return
    try {
      const resp = await sendMessage<UpdateKbResponse>({
        type: 'UPDATE_KB',
        payload: { id: editingId, title: draftTitle, content: draftContent },
      })
      if (resp.payload.error) {
        setMsg({ ok: false, text: `保存失败:${resp.payload.error}` })
        return
      }
      setMsg({
        ok: true,
        text: resp.payload.reembed ? '已保存,正在重新生成标题向量…' : '已保存',
      })
      await refresh()
    } catch (err) {
      setMsg({ ok: false, text: `保存失败:${String(err)}` })
    }
    setEditingId(null)
  }

  const toggleEnabled = async (k: PanelKnowledge) => {
    try {
      const resp = await sendMessage<UpdateKbResponse>({
        type: 'UPDATE_KB',
        payload: { id: k.id, enabled: k.enabled === 1 ? 0 : 1 },
      })
      if (resp.payload.error) setMsg({ ok: false, text: `操作失败:${resp.payload.error}` })
      else await refresh()
    } catch (err) {
      setMsg({ ok: false, text: `操作失败:${String(err)}` })
    }
  }

  const fillKb = async (k: PanelKnowledge) => {
    try {
      const resp = await sendMessage<FillInputResponse>({
        type: 'FILL_INPUT',
        payload: { text: k.content },
      })
      if (resp.payload.success) setMsg({ ok: true, text: '已填充到聊天页输入框 · 请手动发送' })
      else setMsg({ ok: false, text: resp.payload.error ?? '填充失败' })
    } catch (err) {
      setMsg({ ok: false, text: `填充失败:${String(err)}` })
    }
  }

  const copyKb = async (k: PanelKnowledge) => {
    try {
      await navigator.clipboard.writeText(k.content)
      setMsg({ ok: true, text: '已复制到剪贴板' })
    } catch {
      setMsg({ ok: false, text: '复制失败' })
    }
  }

  const deleteKb = async (id: string) => {
    try {
      const resp = await sendMessage<DeleteKbResponse>({
        type: 'DELETE_KB',
        payload: { id },
      })
      if (resp.payload.success) {
        setMsg({ ok: true, text: '知识条目已删除' })
        await refresh()
      } else {
        setMsg({ ok: false, text: `删除失败:${resp.payload.error ?? '未知错误'}` })
      }
    } catch (err) {
      setMsg({ ok: false, text: `删除失败:${String(err)}` })
    }
    setConfirmDeleteId(null)
  }

  if (loading) {
    return <div style={{ fontSize: 12, color: tk.textMuted }}>读取中…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {creating ? (
        <div
          style={{
            border: `1px solid ${tk.border}`,
            borderRadius: 10,
            backgroundColor: tk.bgCard,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="标题(检索锚,如:退货政策)"
            autoFocus
            style={inputStyle(tk)}
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            placeholder="正文(填充/复制的内容)"
            style={inputStyle(tk, { resize: 'vertical' })}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn tk={tk} variant="primary" onClick={() => void submitCreate()}>
              创建(自动向量化)
            </Btn>
            <Btn tk={tk} variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Btn>
          </div>
        </div>
      ) : (
        <Btn tk={tk} variant="primary" onClick={() => setCreating(true)}>
          + 新建知识条目
        </Btn>
      )}

      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="筛选标题或正文…"
        style={inputStyle(tk)}
      />

      <Notice tk={tk} msg={msg} />

      {shown.length === 0 && (
        <div style={{ fontSize: 12, color: tk.textTertiary, padding: '14px 0', textAlign: 'center', lineHeight: 1.7 }}>
          {items.length === 0 ? (
            <>
              还没有知识条目。
              <br />
              把常用话术按"标题+正文"沉淀在这里,
              <br />
              检索时会作为独立来源参与匹配。
            </>
          ) : (
            '没有匹配的条目'
          )}
        </div>
      )}

      {shown.map((k) => {
        const editing = editingId === k.id
        const disabled = k.enabled !== 1
        return (
          <div
            key={k.id}
            style={{
              border: `1px solid ${tk.border}`,
              borderRadius: 10,
              backgroundColor: tk.bgCard,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {editing ? (
              <>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  style={inputStyle(tk)}
                />
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  rows={5}
                  style={inputStyle(tk, { resize: 'vertical' })}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn tk={tk} variant="primary" onClick={() => void submitEdit()}>
                    保存(改标题自动重嵌)
                  </Btn>
                  <Btn tk={tk} variant="ghost" onClick={() => setEditingId(null)}>
                    取消
                  </Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{
                      backgroundColor: KB,
                      color: '#fff',
                      borderRadius: 3,
                      fontSize: 10,
                      padding: '1px 5px',
                      fontWeight: 600,
                    }}
                  >
                    知识库
                  </span>
                  {disabled && (
                    <span style={{ fontSize: 10, color: tk.textMuted }}>已停用</span>
                  )}
                  {!disabled && k.hasEmbedding === 0 && (
                    <span style={{ fontSize: 10, color: tk.textMuted }}>向量生成中…</span>
                  )}
                  {!disabled && k.hasEmbedding === -1 && (
                    <span style={{ fontSize: 10, color: tk.errorText }}>嵌入失败(重启扩展重试)</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: tk.textMuted }}>
                    {formatTs(k.updatedAt)}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {k.title}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: tk.textMuted,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {k.content}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Btn tk={tk} variant="primary" disabled={disabled} onClick={() => void fillKb(k)} title="填充到聊天页输入框(不自动发送)">
                    填充
                  </Btn>
                  <Btn tk={tk} disabled={disabled} onClick={() => void copyKb(k)}>
                    复制
                  </Btn>
                  <Btn tk={tk} onClick={() => startEdit(k)}>
                    编辑
                  </Btn>
                  <Btn tk={tk} title={disabled ? '启用(重新参与检索)' : '停用(保留数据,不参与检索)'} onClick={() => void toggleEnabled(k)}>
                    {disabled ? '启用' : '停用'}
                  </Btn>
                  {confirmDeleteId === k.id ? (
                    <>
                      <Btn tk={tk} variant="danger" onClick={() => void deleteKb(k.id)}>
                        确认删
                      </Btn>
                      <Btn tk={tk} variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        取消
                      </Btn>
                    </>
                  ) : (
                    <Btn tk={tk} variant="danger" onClick={() => setConfirmDeleteId(k.id)}>
                      删除
                    </Btn>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}

      <div style={{ fontSize: 10.5, color: tk.textTertiary, lineHeight: 1.6 }}>
        知识库与金标准的区别:金标准沉淀"真实问答对",知识库沉淀"常用话术卡";
        检索时层级为 金标准 &gt; 知识库 &gt; 历史记录。
      </div>
    </div>
  )
}

function inputStyle(tk: ThemeTokens, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%',
    padding: '5px 8px',
    borderRadius: 7,
    border: `1px solid ${tk.border}`,
    backgroundColor: tk.bgCard,
    color: tk.text,
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    ...extra,
  }
}
