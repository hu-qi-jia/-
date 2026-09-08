/**
 * 知识库 CRUD 编排(P4-KB v1)。
 * 幂等:normalize + 标题 hash 查重,已存在直接返回 exists,不重复建、不重嵌。
 * 编辑:标题实质变更才作废旧向量重嵌(检索锚=标题向量);正文编辑不动向量;
 * enabled 停用切换不重嵌(停用条目在检索读库时被过滤)。
 */
import { db } from './db'
import { queueEmbedding } from './offscreen'
import { hashText, normalizeText } from '../utils/text'
import { planKnowledgeEdit } from './knowledgeEdit'
import type { CreateKbRequest, UpdateKbRequest } from '../types/messages'

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
