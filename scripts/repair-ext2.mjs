/**
 * 修复登录态 profile 中扩展被禁用(unsupportedDeveloperExtension)的问题。
 * v2:每个调用加超时竞速;management.setEnabled;失败则截图留证。
 * 用法:node scripts/repair-ext2.mjs
 */
import { chromium } from '@playwright/test'

const ROOT = 'E:\\个人项目\\拼多多客服检索工具\\personal-ai-memory'
const CHROME =
  'C:\\Users\\胡起嘉\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const EXT = ROOT + '\\build\\chrome-mv3-prod'
const PROFILE = 'E:\\个人项目\\拼多多客服检索工具\\.chrome-debug-profile'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 给任何 Promise 加超时,避免 WebUI API 挂死
const withTimeout = (p, ms, tag) =>
  Promise.race([
    p,
    sleep(ms).then(() => {
      throw new Error(`TIMEOUT: ${tag}`)
    }),
  ])

console.log('launching...')
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
console.log('launched')
await sleep(6000)
console.log('SW:', ctx.serviceWorkers().map((w) => w.url()))

const page = await ctx.newPage()
await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded', timeout: 30000 })
await sleep(2500)

const info = await withTimeout(
  page.evaluate(
    () =>
      new Promise((res) => chrome.developerPrivate.getExtensionsInfo((list) => res(list))),
  ),
  8000,
  'getExtensionsInfo',
).catch((e) => {
  console.log(String(e))
  return []
})
const ext = info.find((e) => (e.path || '').includes('chrome-mv3-prod'))
if (!ext) {
  console.log('未找到扩展条目;info 数量:', info.length)
} else {
  console.log('状态:', ext.state, '原因:', JSON.stringify(ext.disableReasons))
}

if (ext && ext.state !== 'ENABLED') {
  console.log('尝试 management.setEnabled(true)...')
  await withTimeout(
    page.evaluate(
      (id) => new Promise((res) => chrome.management.setEnabled(id, true, res)),
      ext.id,
    ),
    8000,
    'management.setEnabled',
  )
    .then(() => console.log('setEnabled 调用返回'))
    .catch((e) => console.log('setEnabled:', String(e)))
  await sleep(2000)

  const after = await withTimeout(
    page.evaluate(
      () =>
        new Promise((res) => chrome.developerPrivate.getExtensionsInfo((list) => res(list))),
    ),
    8000,
    'getExtensionsInfo#2',
  ).catch(() => [])
  const ext2 = after.find((e) => (e.path || '').includes('chrome-mv3-prod'))
  console.log('启用后状态:', ext2?.state, JSON.stringify(ext2?.disableReasons ?? {}))

  if (ext2?.state !== 'ENABLED') {
    // 截图留证:看 WebUI 上是否有确认弹窗/开关状态
    await page.screenshot({ path: ROOT + '\\logs\\extensions-page.png', fullPage: true })
    console.log('已截图 logs/extensions-page.png')
  }
}

await sleep(3000)
console.log('最终 SW:', ctx.serviceWorkers().map((w) => w.url()))
await ctx.close()
process.exit(0)
