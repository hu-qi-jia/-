/**
 * 知识库 CRUD 编排(P4-KB v1)。
 * 幂等:normalize + 标题 hash 查重,已存在直接返回 exists,不重复建、不重嵌。
 * 编辑:标题实质变更才作废旧向量重嵌(检索锚=标题向量);正文编辑不动向量;
 * enabled 停用切换不重嵌(停用条目在检索读库时被过滤)。
 */
import { db } from './db'
import { queueEmbedding } from './offscreen'
import { hashText, normalizeText } from '../utils/text'
import { chunkText } from '../utils/chunkText'
import { planKnowledgeEdit } from './knowledgeEdit'
import type { CreateKbRequest, UpdateKbRequest, UploadKbDocRequest } from '../types/messages'

export interface CreateKbOutcome {
  id?: string
  exists?: boolean
  error?: string
}

export async function createKnowledge(
  payload: CreateKbRequest['payload'],
): Promise<CreateKbOutcome> {
  const title = normalizeText(payload.title ?? '')
  const content = normalizeText(payload.content ?? '')
  if (!title || !content) return { error: '标题或正文为空' }

  const questionHash = hashText(title)
  const dup = await db.findKnowledgeByTitleHash(questionHash)
  if (dup) return { id: dup.id, exists: true }

  const now = Date.now()
  const id = `kb-${now}-${Math.random().toString(36).slice(2, 8)}`
  await db.addKnowledge({
    id,
    title,
    content,
    questionHash,
    hasEmbedding: 0,
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  })
  queueEmbedding('knowledge', id, title)
  return { id }
}

export interface UpdateKbOutcome {
  id?: string
  reembed?: boolean
  error?: string
}

/** 编辑知识条目:双字段编辑 / enabled 停用切换;标题实质变更时重嵌 */
export async function updateKnowledgeWithReembed(
  payload: UpdateKbRequest['payload'],
): Promise<UpdateKbOutcome> {
  const existing = await db.getKnowledge(payload.id)
  if (!existing) return { error: '知识条目不存在' }

  // 文档块只读:锚是块正文,直接改标题/正文会嵌错文本;要改请重新上传整篇
  if (existing.source === 'doc' && (payload.title !== undefined || payload.content !== undefined)) {
    return { error: '文档分块不可编辑,请修改后重新上传该文档' }
  }

  // enabled 切换:直改不重嵌(编辑决策不管 enabled)
  if (payload.enabled !== undefined) {
    await db.updateKnowledge(payload.id, { enabled: payload.enabled === 1 ? 1 : 0 })
    if (payload.title === undefined && payload.content === undefined) {
      return { id: payload.id, reembed: false }
    }
  }

  const others = new Set(
    (await db.knowledge.toArray())
      .filter((k) => k.id !== payload.id)
      .map((k) => k.questionHash),
  )
  const plan = planKnowledgeEdit(
    existing,
    { title: payload.title, content: payload.content },
    others,
  )
  if (!plan.ok) return { error: plan.error }

  const patch = { ...plan.updates }
  if (plan.reembed) patch.hasEmbedding = 0
  await db.updateKnowledge(payload.id, patch)
  if (plan.reembed) {
    queueEmbedding('knowledge', payload.id, patch.title ?? existing.title)
  }
  return { id: payload.id, reembed: plan.reembed }
}

/** 删除知识条目 */
export async function deleteKnowledge(id: string): Promise<void> {
  await db.deleteKnowledge(id)
}

// ─── md 文档上传(P4-KB)────────────────────────────────────────────────────────
// 分块逻辑与原项目一致(chunkText:500 字窗口 / 75 重叠);每块一条知识条目,
// 检索锚 = 块正文(语义检索按内容命中),BM25 同样跑正文;同名文档整篇替换。

/** 单文档块数上限:超出提示手动拆分(≈4.2 万字,防止一次排几百个嵌入任务) */
export const MAX_DOC_CHARS = 100_000

export interface UploadKbDocOutcome {
  docId?: string
  chunkCount?: number
  replaced?: boolean
  error?: string
}

export async function importKbDocument(
  payload: UploadKbDocRequest['payload'],
): Promise<UploadKbDocOutcome> {
  // 文档名去扩展名做 docId(展示与幂等键);内容只做首尾清理,不动内部空白(保留 md 排版)
  const docId = normalizeText((payload.name ?? '').replace(/\.(md|markdown|txt)$/i, ''))
  const content = (payload.content ?? '').trim()
  if (!docId) return { error: '文档名为空' }
  if (!content) return { error: '文档内容为空' }
  if (content.length > MAX_DOC_CHARS) {
    return { error: `文档过长(${content.length} 字符,上限 ${MAX_DOC_CHARS}),请拆分后分篇上传` }
  }

  const chunks = chunkText(content)
  const replaced = (await db.deleteKnowledgeByDoc(docId)) > 0

  const now = Date.now()
  const rootId = `kbd-${now}-${Math.random().toString(36).slice(2, 8)}`
  for (let i = 0; i < chunks.length; i++) {
    const id = chunks.length === 1 ? rootId : `${rootId}-c${i}`
    const title = chunks.length === 1 ? docId : `${docId} · 段${i + 1}`
    await db.addKnowledge({
      id,
      title,
      content: chunks[i],
      questionHash: hashText(`${docId}#${i}`),
      hasEmbedding: 0,
      enabled: 1,
      source: 'doc',
      docId,
      createdAt: now,
      updatedAt: now,
    })
    // 锚向量 = 块正文(与手工条目的"标题锚"不同,检索/BM25 由 search.ts 按 source 区分)
    queueEmbedding('knowledge', id, chunks[i])
  }
  return { docId, chunkCount: chunks.length, replaced }
}
