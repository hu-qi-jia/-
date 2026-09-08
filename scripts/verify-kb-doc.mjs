/**
 * P4-KB 文档上传端到端合成验收(纯数据层,一次性 profile):
 *   上传长 md → 按 chunkText(500/75)分块 → 校验块边界与重叠 → 逐块向量回填 →
 *   检索命中块(kind=knowledge,锚=正文)→ 文档块拒编辑 → 整篇重传替换 →
 *   导出含 source/docId → 幂等再导入 → 清理。
 * 用法:node scripts/verify-kb-doc.mjs
 */
import { chromium } from '@playwright/test'

const ROOT = 'E:\\个人项目\\拼多多客服检索工具\\personal-ai-memory'
const CHROME =
  'C:\\Users\\胡起嘉\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const EXT = ROOT + '\\build\\chrome-mv3-prod'
const PROFILE = ROOT + '\\.diag-fresh-profile'
const DOC = '售后政策手册'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 与 src/utils/chunkText.ts 同公式(原项目 500/75)
const SIZE = 500
const STEP = 500 - 75
const expectChunks = (text) => {
  if (text.length <= SIZE) return [text]
  const out = []
  let i = 0
  while (i < text.length) {
    out.push(text.slice(i, i + SIZE))
    i += STEP
  }
  return out
}

// ~1560 字的 md 正文(退货/发货/发票多主题,语义可检索)
const SECTIONS = []
for (let s = 1; s <= 12; s++) {
  SECTIONS.push(
    `## 第${s}节\n关于售后服务的说明${s}:商品签收后七天内支持无理由退货,需保持吊牌完整与包装完好;` +
      `质量问题退货由店家承担运费,无理由退货邮费自理;发货时间为每日下午四点前下单当天发出,` +
      `偏远地区顺延一天;如需开具电子发票,请在订单备注中写明抬头与税号。`,
  )
}
const MD = SECTIONS.join('\n\n')
const EXPECTED = expectChunks(MD)

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: false,
  timeout: 60000,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--hide-crash-restore-bubble',
    '--no-default-browser-check',
  ],
})
await sleep(5000)
let extId = null
for (let i = 0; i < 10 && !extId; i++) {
  const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'))
  if (sw) extId = new URL(sw.url()).host
  if (!extId) await sleep(1000)
}
if (!extId) {
  console.log('FAIL: 扩展未加载')
  await ctx.close()
  process.exit(1)
}

let pop = null
for (let i = 0; i < 12 && !pop; i++) {
  await sleep(2000)
  try {
    const p = await ctx.newPage()
    await p.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    pop = p
  } catch {
    /* 重试 */
  }
}
if (!pop) {
  console.log('FAIL: popup 打不开')
  await ctx.close()
  process.exit(1)
}
await sleep(1500)

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const send = (type, payload) =>
  pop.evaluate(
    async ({ type, payload }) => (await chrome.runtime.sendMessage({ type, payload }))?.payload ?? {},
    { type, payload },
  )

// ── 1. 上传 md → 分块数量与预期一致(原项目公式)──
const up = await send('UPLOAD_KB_DOC', { name: `${DOC}.md`, content: MD })
check(
  `上传成功且分块数 = ${EXPECTED.length}(500字/75重叠)`,
  up.docId === DOC && up.chunkCount === EXPECTED.length && up.replaced === false,
  JSON.stringify(up).slice(0, 160),
)

// ── 2. 块内容/边界/重叠与原项目公式逐一比对 ──
const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'))
const dbChunks = await sw.evaluate(async (docId) => {
  const rows = await globalThis.pddDb.listKnowledgeByDoc(docId)
  return rows
    .map((r) => ({ id: r.id, title: r.title, content: r.content, source: r.source, hasEmbedding: r.hasEmbedding }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh', { numeric: true }))
}, DOC)
let boundsOk = dbChunks.length === EXPECTED.length
for (let i = 0; i < Math.min(dbChunks.length, EXPECTED.length) && boundsOk; i++) {
  boundsOk =
    dbChunks[i].content === EXPECTED[i] &&
    dbChunks[i].source === 'doc' &&
    (EXPECTED.length === 1 || dbChunks[i].title === `${DOC} · 段${i + 1}`)
}
check('每块正文与 chunkText 公式一致(含 75 字重叠)、source=doc、标题带段号', boundsOk)

// ── 3. 逐块向量回填(首跑含模型下载,预算 ~5 分钟)──
let allEmbedded = false
for (let i = 0; i < 100 && !allEmbedded; i++) {
  await sleep(3000)
  const rows = await sw.evaluate(async (docId) => {
    const rows = await globalThis.pddDb.listKnowledgeByDoc(docId)
    return rows.map((r) => r.hasEmbedding)
  }, DOC)
  allEmbedded = rows.length > 0 && rows.every((h) => h === 1)
  if (i === 20) console.log('…模型下载/推理中(20×3s)')
}
check(`${EXPECTED.length} 块全部向量回填(hasEmbedding=1)`, allEmbedded)

// ── 4. 检索命中块:锚=正文(语义+BM25 均跑正文)──
const sug = await send('GET_SUGGESTIONS', { query: '签收后七天内可以无理由退货吗' })
const docIds = new Set(dbChunks.map((c) => c.id))
const hit = (sug.suggestions ?? []).find((s) => docIds.has(s.sourceId))
check(
  '检索命中文档块(kind=knowledge)',
  hit?.kind === 'knowledge' && docIds.has(hit.sourceId),
  hit ? `score=${hit.score.toFixed(2)} src=${hit.sourceQuestion.slice(0, 18)}…` : `无候选:${JSON.stringify(sug).slice(0, 140)}`,
)

// ── 5. 文档块拒编辑(锚=正文,改标题会嵌错文本)──
const edit = await send('UPDATE_KB', { id: dbChunks[0].id, title: '改名' })
check('文档块直接编辑被拒', !!edit.error, edit.error ?? '')

// ── 6. 整篇重传替换(不产生重复块)──
const MD2 = MD + '\n\n## 附录\n退换货流程:申请-审核-寄回-验收-退款,全程可在订单页跟踪。'
const EXPECTED2 = expectChunks(MD2)
const up2 = await send('UPLOAD_KB_DOC', { name: `${DOC}.md`, content: MD2 })
const count2 = await sw.evaluate(async (docId) => (await globalThis.pddDb.listKnowledgeByDoc(docId)).length, DOC)
check(
  `重传整篇替换( replaced=true,块数 ${EXPECTED.length}→${EXPECTED2.length},无重复)`,
  up2.replaced === true && up2.chunkCount === EXPECTED2.length && count2 === EXPECTED2.length,
  `replaced=${up2.replaced} chunkCount=${up2.chunkCount} 实际=${count2}`,
)

// ── 7. 导出含 source/docId(剥向量)→ 幂等再导入 ──
const exp = await send('EXPORT_DATA', { includeMemory: false })
const docKb = (exp.envelope?.knowledge ?? []).filter((k) => k.docId === DOC)
check(
  '导出携带文档块(source=doc、docId、无向量字段)',
  docKb.length === EXPECTED2.length && docKb.every((k) => k.source === 'doc' && !('qEmbedding' in k)),
  `knowledge=${exp.envelope?.knowledge?.length}`,
)
const reimp = await send('IMPORT_DATA', { envelope: exp.envelope })
check(
  '原样再导入幂等(块全跳过)',
  (reimp.addedKnowledge ?? 0) === 0 && (reimp.skippedKnowledge ?? 0) >= EXPECTED2.length,
  JSON.stringify(reimp).slice(0, 180),
)

// ── 8. 清理 ──
const cleaned = await sw.evaluate(async (docId) => globalThis.pddDb.deleteKnowledgeByDoc(docId), DOC)
check('清理:整篇文档块已删除', cleaned === EXPECTED2.length, `deleted=${cleaned}`)

const failed = results.filter((r) => !r.ok)
console.log(`\n=== KB 文档上传验收:${results.length - failed.length}/${results.length} 通过 ===`)
await ctx.close()
process.exit(failed.length > 0 ? 1 : 0)
