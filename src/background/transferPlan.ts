/**
 * 导入导出 v2 —— 纯计划逻辑(无 DB/chrome 依赖,单测覆盖)。
 * 设计依据:设计文档 §8(信封 2.0:默认 goldens+folders+settings,记忆可选;
 * 恢复按 id/内容幂等,不覆盖本地编辑)。
 *
 * 实现差异(记录在案):导出统一剥离向量字段、hasEmbedding 归 0,
 * 导入端全量重新嵌入 —— 终态与"含向量搬库"一致,免去跨模型版本校验。
 */
import type {
  FolderRecord,
  GoldenRecord,
  KnowledgeRecord,
  PddSettings,
  QaRecord,
  ReplyRecord,
} from '../types/memory'
import { SELF_TEST_SESSION_KEY, UNCATEGORIZED_FOLDER_ID } from '../types/memory'

export const EXPORT_VERSION = '2.0'

/** 导出金标准(向量剥离,导入端统一重嵌) */
export interface ExportedGolden {
  id: string
  folderId: string | null
  question: string
  answer: string
  questionHash: string
  hasEmbedding: number
  sourceRecordId?: string
  sourceReplyId?: string
  createdAt: number
  updatedAt: number
}

/** 导出问答记录(问题向量剥离) */
export interface ExportedQa {
  id: string
  sessionKey: string
  buyerIdTail?: string
  question: string
  questionHash: string
  questionTs: number
  hasEmbedding: number
  replyCount: number
  createdAt: number
  updatedAt: number
}

/** 导出回复(预留向量字段剥离) */
export interface ExportedReply {
  id: string
  qaId: string
  text: string
  contentHash: string
  msgId?: string
  ts: number
  hasEmbedding: number
}

/** 导出知识库条目(标题锚向量剥离;enabled 原样保留) */
export interface ExportedKnowledge {
  id: string
  title: string
  content: string
  questionHash: string
  hasEmbedding: number
  enabled: number
  createdAt: number
  updatedAt: number
}

export interface ExportEnvelope {
  version: string
  exportedAt: number
  settings: PddSettings
  folders: FolderRecord[]
  goldens: ExportedGolden[]
  /** 知识库:人工精选数据,与金标准同级,始终导出(不受 includeMemory 门控) */
  knowledge?: ExportedKnowledge[]
  qaRecords?: ExportedQa[]
  replies?: ExportedReply[]
}

const stripGolden = (g: GoldenRecord): ExportedGolden => ({
  id: g.id,
  folderId: g.folderId,
  question: g.question,
  answer: g.answer,
  questionHash: g.questionHash,
  hasEmbedding: 0,
  ...(g.sourceRecordId !== undefined ? { sourceRecordId: g.sourceRecordId } : {}),
  ...(g.sourceReplyId !== undefined ? { sourceReplyId: g.sourceReplyId } : {}),
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
})

const stripQa = (q: QaRecord): ExportedQa => ({
  id: q.id,
  sessionKey: q.sessionKey,
  ...(q.buyerIdTail !== undefined ? { buyerIdTail: q.buyerIdTail } : {}),
  question: q.question,
  questionHash: q.questionHash,
  questionTs: q.questionTs,
  hasEmbedding: 0,
  replyCount: q.replyCount,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
})

const stripReply = (r: ReplyRecord): ExportedReply => ({
  id: r.id,
  qaId: r.qaId,
  text: r.text,
  contentHash: r.contentHash,
  ...(r.msgId !== undefined ? { msgId: r.msgId } : {}),
  ts: r.ts,
  hasEmbedding: 0,
})

const stripKnowledge = (k: KnowledgeRecord): ExportedKnowledge => ({
  id: k.id,
  title: k.title,
  content: k.content,
  questionHash: k.questionHash,
  hasEmbedding: 0,
  enabled: k.enabled,
  createdAt: k.createdAt,
  updatedAt: k.updatedAt,
})

/** 构建导出信封;includeMemory=false 时不携带问答/回复字段;知识库始终携带 */
export function buildExportEnvelope(input: {
  goldens: GoldenRecord[]
  folders: FolderRecord[]
  knowledge?: KnowledgeRecord[]
  settings: PddSettings
  qaRecords?: QaRecord[]
  replies?: ReplyRecord[]
  includeMemory: boolean
  exportedAt: number
}): ExportEnvelope {
  const env: ExportEnvelope = {
    version: EXPORT_VERSION,
    exportedAt: input.exportedAt,
    settings: input.settings,
    folders: input.folders,
    goldens: input.goldens.map(stripGolden),
    knowledge: (input.knowledge ?? []).map(stripKnowledge),
  }
  if (input.includeMemory) {
    env.qaRecords = (input.qaRecords ?? []).map(stripQa)
    env.replies = (input.replies ?? []).map(stripReply)
  }
  return env
}

// ─── 导入计划 ──────────────────────────────────────────────────────────────────

export interface GoldenImportPlan {
  toAdd: GoldenRecord[]
  skipped: number
}

/**
 * 金标准导入计划:按归一化问题 hash 幂等(已存在跳过,不覆盖本地编辑);
 * 导入包内部同 hash 重复只留第一条;入列记录强制 hasEmbedding=0 待重嵌。
 */
export function planGoldenImports(
  incoming: ExportedGolden[],
  existingQuestionHashes: Set<string>,
): GoldenImportPlan {
  const toAdd: GoldenRecord[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const g of incoming) {
    if (existingQuestionHashes.has(g.questionHash) || seen.has(g.questionHash)) {
      skipped += 1
      continue
    }
    seen.add(g.questionHash)
    // 显式挑字段:导入来源可能携带多余运行时字段(如向量),一律丢弃待重嵌
    toAdd.push({
      id: g.id,
      folderId: g.folderId,
      question: g.question,
      answer: g.answer,
      questionHash: g.questionHash,
      hasEmbedding: 0,
      ...(g.sourceRecordId !== undefined ? { sourceRecordId: g.sourceRecordId } : {}),
      ...(g.sourceReplyId !== undefined ? { sourceReplyId: g.sourceReplyId } : {}),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    })
  }
  return { toAdd, skipped }
}

export interface FolderImportPlan {
  toAdd: FolderRecord[]
  skipped: number
}

/**
 * 文件夹导入计划:按 id 幂等;预置"未分类"恒跳过;
 * 悬空 parentId(不在已有集与导入包内)→ 置为根层。
 */
export function planFolderImports(
  incoming: FolderRecord[],
  existingIds: Set<string>,
): FolderImportPlan {
  const seen = new Set<string>()
  const keep: FolderRecord[] = []
  let skipped = 0
  for (const f of incoming) {
    if (f.id === UNCATEGORIZED_FOLDER_ID || existingIds.has(f.id) || seen.has(f.id)) {
      skipped += 1
      continue
    }
    seen.add(f.id)
    keep.push(f)
  }
  const allowedParents = new Set([...existingIds, ...keep.map((f) => f.id)])
  const toAdd = keep.map((f) =>
    f.parentId !== null && !allowedParents.has(f.parentId) ? { ...f, parentId: null } : f,
  )
  return { toAdd, skipped }
}

export interface MemoryImportPlan {
  toAddQa: QaRecord[]
  toAddReplies: ReplyRecord[]
  skippedQa: number
  skippedReplies: number
}

/**
 * 记忆搬库计划:问答按 id 幂等,自检示例数据排除;
 * 回复按 id 幂等,且 qaId 必须指向已有或本次导入的问答(孤儿丢弃计数)。
 */
export function planMemoryImports(
  incomingQa: ExportedQa[],
  incomingReplies: ExportedReply[],
  existingQaIds: Set<string>,
  existingReplyIds: Set<string>,
): MemoryImportPlan {
  const toAddQa: QaRecord[] = []
  const seenQa = new Set<string>()
  let skippedQa = 0
  for (const q of incomingQa) {
    if (q.sessionKey === SELF_TEST_SESSION_KEY) {
      skippedQa += 1
      continue
    }
    if (existingQaIds.has(q.id) || seenQa.has(q.id)) {
      skippedQa += 1
      continue
    }
    seenQa.add(q.id)
    toAddQa.push({
      id: q.id,
      sessionKey: q.sessionKey,
      ...(q.buyerIdTail !== undefined ? { buyerIdTail: q.buyerIdTail } : {}),
      question: q.question,
      questionHash: q.questionHash,
      questionTs: q.questionTs,
      hasEmbedding: 0,
      replyCount: q.replyCount,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    })
  }

  const allowedQaIds = new Set([...existingQaIds, ...toAddQa.map((q) => q.id)])
  const toAddReplies: ReplyRecord[] = []
  const seenReply = new Set<string>()
  let skippedReplies = 0
  for (const r of incomingReplies) {
    if (existingReplyIds.has(r.id) || seenReply.has(r.id) || !allowedQaIds.has(r.qaId)) {
      skippedReplies += 1
      continue
    }
    seenReply.add(r.id)
    toAddReplies.push({
      id: r.id,
      qaId: r.qaId,
      text: r.text,
      contentHash: r.contentHash,
      ...(r.msgId !== undefined ? { msgId: r.msgId } : {}),
      ts: r.ts,
      hasEmbedding: 0,
    })
  }
  return { toAddQa, toAddReplies, skippedQa, skippedReplies }
}

export interface KnowledgeImportPlan {
  toAdd: KnowledgeRecord[]
  skipped: number
}

/**
 * 知识库导入计划:按归一化标题 hash 幂等(已存在跳过,不覆盖本地编辑);
 * 导入包内部同 hash 重复只留第一条;enabled 原样保留,向量一律丢弃待重嵌。
 */
export function planKnowledgeImports(
  incoming: ExportedKnowledge[],
  existingTitleHashes: Set<string>,
): KnowledgeImportPlan {
  const toAdd: KnowledgeRecord[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const k of incoming) {
    if (existingTitleHashes.has(k.questionHash) || seen.has(k.questionHash)) {
      skipped += 1
      continue
    }
    seen.add(k.questionHash)
    // 显式挑字段:运行时多余字段(如向量)一律不带入
    toAdd.push({
      id: k.id,
      title: k.title,
      content: k.content,
      questionHash: k.questionHash,
      hasEmbedding: 0,
      enabled: k.enabled,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    })
  }
  return { toAdd, skipped }
}
