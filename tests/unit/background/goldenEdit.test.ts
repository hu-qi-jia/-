/**
 * 金标准编辑决策单测:空字段拒绝 / 同问题 hash 冲突拒绝 /
 * 问题变更才作废重嵌(答案不影响问题锚向量)。设计依据:设计文档 §6.3(编辑保存即自动重嵌)。
 */
import { describe, it, expect } from 'vitest'
import { planGoldenEdit } from '../../../src/background/goldenEdit'
import { hashText } from '../../../src/utils/text'

const existing = { question: '这个支持7天无理由退换吗', questionHash: hashText('这个支持7天无理由退换吗') }

describe('planGoldenEdit', () => {
  it('问题改成空/纯空白 → 拒绝', () => {
    expect(planGoldenEdit(existing, { question: '   ' }, new Set()).ok).toBe(false)
    expect(planGoldenEdit(existing, { question: '' }, new Set()).ok).toBe(false)
  })

  it('答案改成空 → 拒绝', () => {
    const plan = planGoldenEdit(existing, { answer: '  ' }, new Set())
    expect(plan.ok).toBe(false)
  })

  it('问题改成与其他金标准同 hash → 拒绝(幂等约束)', () => {
    const otherHashes = new Set([hashText('什么时候发货')])
    const plan = planGoldenEdit(existing, { question: ' 什么时候发货 ' }, otherHashes)
    expect(plan.ok).toBe(false)
  })

  it('问题实质变更 → 更新归一化问题与 hash,且 reembed=true', () => {
    const plan = planGoldenEdit(existing, { question: '这个支持 7 天无理由退换吗' }, new Set())
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.reembed).toBe(true)
      expect(plan.updates.question).toBe('这个支持 7 天无理由退换吗')
      expect(plan.updates.questionHash).toBe(hashText('这个支持 7 天无理由退换吗'))
    }
  })

  it('问题仅空白差异(归一化后同 hash)→ 不算变更,不重嵌', () => {
    const plan = planGoldenEdit(existing, { question: '  这个支持7天无理由退换吗  ' }, new Set())
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.reembed).toBe(false)
      expect(plan.updates.question).toBeUndefined()
      expect(plan.updates.questionHash).toBeUndefined()
    }
  })

  it('只改答案 → updates 含归一化答案,reembed=false(问题锚向量仍有效)', () => {
    const plan = planGoldenEdit(existing, { answer: ' 支持的,7 天内都可以 ' }, new Set())
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.reembed).toBe(false)
      expect(plan.updates.answer).toBe('支持的,7 天内都可以')
    }
  })

  it('只迁移文件夹 → reembed=false', () => {
    const plan = planGoldenEdit(existing, { folderId: 'f1' }, new Set())
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.reembed).toBe(false)
      expect(plan.updates.folderId).toBe('f1')
    }
  })
})
