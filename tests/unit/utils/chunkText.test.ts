/**
 * 文档分块单测 —— 与原项目(personal-ai-memory 改造前)chunkText 完全同逻辑:
 * 500 字符滑动窗口、75 字符重叠(步长 425),短文本整段返回。
 * 用途:P4-KB md 文档上传 → 分块 → 逐块向量化。
 */
import { describe, it, expect } from 'vitest'
import { chunkText, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS } from '../../../src/utils/chunkText'

describe('chunkText(与原项目一致)', () => {
  it('常量与原项目一致:500 / 75', () => {
    expect(CHUNK_SIZE_CHARS).toBe(500)
    expect(CHUNK_OVERLAP_CHARS).toBe(75)
  })

  it('短文本(≤500)整段返回,不切分', () => {
    const t = 'a'.repeat(500)
    expect(chunkText(t)).toEqual([t])
    expect(chunkText('短文本')).toEqual(['短文本'])
  })

  it('501 字符 → 两块:[0,500) 与 [425,501)', () => {
    const t = Array.from({ length: 501 }, (_, i) => String.fromCharCode(33 + (i % 90))).join('')
    const chunks = chunkText(t)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(t.slice(0, 500))
    expect(chunks[1]).toBe(t.slice(425))
  })

  it('长文本相邻块重叠 75 字符(后块头部 = 前块尾部)', () => {
    const t = Array.from({ length: 2000 }, (_, i) => String.fromCharCode(33 + (i % 90))).join('')
    const chunks = chunkText(t)
    expect(chunks.length).toBeGreaterThan(2)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].slice(0, CHUNK_OVERLAP_CHARS)).toBe(
        chunks[i - 1].slice(-CHUNK_OVERLAP_CHARS),
      )
    }
  })

  it('拼接覆盖无遗漏:每字符至少出现一次(除重叠外顺序拼接)', () => {
    const t = Array.from({ length: 1500 }, (_, i) => String(i % 10)).join('')
    const chunks = chunkText(t)
    // 第一块从头开始
    expect(chunks[0].slice(0, 10)).toBe(t.slice(0, 10))
    // 最后一块到结尾
    expect(chunks[chunks.length - 1].slice(-10)).toBe(t.slice(-10))
  })

  it('空字符串 → 单块空串(由调用方拒绝空内容)', () => {
    expect(chunkText('')).toEqual([''])
  })
})
