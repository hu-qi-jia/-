/**
 * 面板纯逻辑单测:关键词筛选 / 剩余保留天数 / 两层文件夹树构建。
 * 设计依据:设计文档 §7(记忆列表 / 回复文件夹)。
 */
import { describe, it, expect } from 'vitest'
import {
  filterQaRecords,
  remainingDays,
  buildFolderTree,
  type PanelFolder,
  type PanelGolden,
  type FolderNode,
} from '../../../src/utils/panelLogic'
import { UNCATEGORIZED_FOLDER_ID } from '../../../src/types/memory'

const DAY = 86_400_000

describe('filterQaRecords 关键词筛选', () => {
  const items = [
    { id: 'a', question: '这个手机壳支持 iPhone 14 吗' },
    { id: 'b', question: '什么时候发货?' },
    { id: 'c', question: '能  开发票吗' }, // 内部双空格 → 归一化后单空格
  ]

  it('空/纯空白关键词返回全量', () => {
    expect(filterQaRecords(items, '')).toHaveLength(3)
    expect(filterQaRecords(items, '   ')).toHaveLength(3)
  })

  it('按归一化包含匹配(容忍空白差异)', () => {
    expect(filterQaRecords(items, '发票').map((x) => x.id)).toEqual(['c'])
    expect(filterQaRecords(items, '能 开发票').map((x) => x.id)).toEqual(['c'])
    expect(filterQaRecords(items, '发货').map((x) => x.id)).toEqual(['b'])
  })

  it('无命中返回空数组', () => {
    expect(filterQaRecords(items, '退款')).toEqual([])
  })
})

describe('remainingDays 剩余保留天数', () => {
  const ts = 1_000_000_000_000

  it('刚记录 → 满额天数', () => {
    expect(remainingDays(ts, ts, 90)).toBe(90)
  })

  it('不足一天向上取整', () => {
    expect(remainingDays(ts, ts + 88.5 * DAY, 90)).toBe(2)
  })

  it('恰好到期 → 0', () => {
    expect(remainingDays(ts, ts + 90 * DAY, 90)).toBe(0)
  })

  it('已过期 → 夹为 0(不为负)', () => {
    expect(remainingDays(ts, ts + 91 * DAY, 90)).toBe(0)
  })
})

describe('buildFolderTree 两层文件夹树', () => {
  const folder = (id: string, parentId: string | null, position: number, name = id): PanelFolder => ({
    id,
    parentId,
    name,
    position,
  })
  const golden = (id: string, folderId: string | null): PanelGolden => ({
    id,
    folderId,
    question: `q-${id}`,
    answer: `a-${id}`,
    hasEmbedding: 1,
    updatedAt: 1,
  })

  it('根夹/子夹按 position 排序,金标准按 folderId 归组', () => {
    const folders = [
      folder('f2', null, 2, '物流'),
      folder('f1', null, 1, '售前'),
      folder('f1-a', 'f1', 2, '发票'),
      folder('f1-b', 'f1', 1, '优惠'),
    ]
    const goldens = [golden('g1', 'f1'), golden('g2', 'f1-b'), golden('g3', 'f1-a')]

    const tree = buildFolderTree(folders, goldens)
    expect(tree.map((n) => n.folder.id)).toEqual(['f1', 'f2'])
    expect(tree[0].children.map((n) => n.folder.id)).toEqual(['f1-b', 'f1-a'])
    expect(tree[0].goldens.map((g) => g.id)).toEqual(['g1'])
    expect(tree[0].children[0].goldens.map((g) => g.id)).toEqual(['g2'])
    expect(tree[0].children[1].goldens.map((g) => g.id)).toEqual(['g3'])
  })

  it('folderId 为 null 或指向不存在夹的金标准 → 归入未分类节点', () => {
    const folders = [folder(UNCATEGORIZED_FOLDER_ID, null, 0, '未分类'), folder('f1', null, 1)]
    const goldens = [golden('g1', null), golden('g2', 'ghost-folder'), golden('g3', 'f1')]

    const tree = buildFolderTree(folders, goldens)
    const unc = tree.find((n) => n.folder.id === UNCATEGORIZED_FOLDER_ID) as FolderNode
    expect(unc.goldens.map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(tree.find((n) => n.folder.id === 'f1')?.goldens.map((g) => g.id)).toEqual(['g3'])
  })

  it('子夹 parentId 悬空 → 兜底当根层展示', () => {
    const folders = [folder('f1', null, 1), folder('orphan', 'missing-parent', 2)]
    const tree = buildFolderTree(folders, [])
    expect(tree.map((n) => n.folder.id).sort()).toEqual(['f1', 'orphan'])
  })

  it('未分类夹缺失时合成兜底节点收纳孤儿金标准', () => {
    const tree = buildFolderTree([folder('f1', null, 1)], [golden('g1', null)])
    const unc = tree.find((n) => n.folder.id === UNCATEGORIZED_FOLDER_ID) as FolderNode
    expect(unc.goldens.map((g) => g.id)).toEqual(['g1'])
  })
})
