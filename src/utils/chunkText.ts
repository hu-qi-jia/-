/**
 * 文档分块 —— 与原项目(personal-ai-memory 改造前)chunkText 完全同逻辑。
 * 500 字符滑动窗口、75 字符重叠(步长 425):bge-small-zh-v1.5 上下文 512 token,
 * 混排中英文按 ~100-125 token 估算;重叠保留跨边界语义,避免句子被拦腰切断。
 */

export const CHUNK_SIZE_CHARS = 500
export const CHUNK_OVERLAP_CHARS = 75

export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE_CHARS) return [text]

  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE_CHARS))
    i += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS
  }
  return chunks
}
