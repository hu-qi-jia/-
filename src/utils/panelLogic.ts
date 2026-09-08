/**
 * 面板纯逻辑(popup 消费):记忆列表关键词筛选 / 剩余保留天数 / 两层文件夹树构建。
 * 设计依据:设计文档 §7(面板结构)。纯函数,无 chrome/DB 依赖,便于单测。
 */
import { normalizeText } from './text'
import { UNCATEGORIZED_FOLDER_ID, UNCATEGORIZED_FOLDER_NAME } from '../types/memory'
import type { PanelFolder, PanelGolden } from '../types/messages'

export type { PanelFolder, PanelGolden }

/** 记忆列表关键词筛选:归一化包含匹配;空关键词返回全量 */
export function filterQaRecords<T extends { question: string }>(items: T[], keyword: string): T[] {
  const kw = normalizeText(keyword)
  if (!kw) return items
  return items.filter((it) => normalizeText(it.question).includes(kw))
}

/** 剩余保留天数:向上取整,过期夹为 0 */
export function remainingDays(questionTs: number, now: number, retentionDays: number): number {
  const remainMs = questionTs + retentionDays * 86_400_000 - now
  return Math.max(0, Math.ceil(remainMs / 86_400_000))
}

/** 文件夹树节点:金标准挂在自己归属的夹上 */
export interface FolderNode {
  folder: PanelFolder
  children: FolderNode[]
  goldens: PanelGolden[]
}

const byPosition = (a: FolderNode, b: FolderNode): number =>
  a.folder.position - b.folder.position ||
  a.folder.name.localeCompare(b.folder.name, 'zh-Hans-CN')

/**
 * 构建两层文件夹树(根层 + 一层子夹)。
 * 兜底规则:
 *  - 金标准 folderId 为 null 或指向不存在的夹 → 归入"未分类"节点;
 *  - "未分类"夹缺失(理论上 ensurePresetFolders 保证存在)→ 合成兜底节点;
 *  - 子夹 parentId 悬空 → 当根层展示。
 */
export function buildFolderTree(folders: PanelFolder[], goldens: PanelGolden[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>()
  for (const f of folders) {
    nodes.set(f.id, { folder: f, children: [], goldens: [] })
  }
  let uncIsSynthetic = false
  if (!nodes.has(UNCATEGORIZED_FOLDER_ID)) {
    uncIsSynthetic = true
    nodes.set(UNCATEGORIZED_FOLDER_ID, {
      folder: {
        id: UNCATEGORIZED_FOLDER_ID,
        parentId: null,
        name: UNCATEGORIZED_FOLDER_NAME,
        position: 0,
      },
      children: [],
      goldens: [],
    })
  }

  const roots: FolderNode[] = []
  for (const f of folders) {
    const node = nodes.get(f.id)!
    const parent = f.parentId !== null ? nodes.get(f.parentId) : undefined
    if (parent && f.parentId !== f.id) parent.children.push(node)
    else roots.push(node)
  }

  for (const g of goldens) {
    const target =
      g.folderId !== null ? nodes.get(g.folderId) : undefined
    ;(target ?? nodes.get(UNCATEGORIZED_FOLDER_ID)!).goldens.push(g)
  }

  // 合成兜底节点(库中实际无"未分类"夹)仅在确有孤儿金标准要收纳时才入根层
  const uncNode = nodes.get(UNCATEGORIZED_FOLDER_ID)!
  if (uncIsSynthetic && uncNode.goldens.length > 0) roots.push(uncNode)

  roots.sort(byPosition)
  for (const node of nodes.values()) node.children.sort(byPosition)
  return roots
}
