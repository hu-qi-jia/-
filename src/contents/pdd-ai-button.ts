/**
 * PDD 聊天工作台 —— AI 回复按钮 + 候选弹窗 + 直填(ISOLATED,P2-4)
 *
 * 交互(设计文档 §6.3):
 *  - 每条可见买家文本行右侧常显半透明 AI 圆钮(悬停加深)
 *  - 点击 → 合并该行向上连续买家文本为 query → SW GET_SUGGESTIONS
 *  - 状态机:无候选提示 / 单候选或直填开关开 → 直填 / 多候选弹窗 top-3
 *  - 弹窗:金标准徽标+置顶、得分、同内容×n、原始问题摘要、设为金标准、仅复制
 *
 * 边界(不逾越):
 *  - 只填充官方输入框 textarea#replyTextarea(原生 value setter + input 事件,
 *    2026-09-08 真机校准通过),发送永远由人工点击 —— 绝不自动发送;
 *  - UI 不进 Vue 管理的子树:统一挂在 body 下的 fixed 覆盖层,按行坐标渲染,
 *    防止平台重渲染把注入节点清掉(买家行 rect 可滚出容器,必须按可见性裁剪)。
 */
import type { PlasmoCSConfig } from 'plasmo'
import type { Suggestion, UiSettings } from '../types/messages'
import {
  decideUiAction,
  mergeBuyerQuery,
  type UiAction,
} from '../utils/pddUiLogic'

export const config: PlasmoCSConfig = {
  matches: ['https://mms.pinduoduo.com/chat-merchant/*'],
}

const DEBUG = false
const SCAN_MS = 800 // 按钮重排周期(轻量:几十行 getBoundingClientRect)
const ROW_SEL = '#msgListContainer li.onemsg'
const LIST_SEL = '#msgListContainer'
const INPUT_SEL = '#replyTextarea'
const OVERLAY_ID = 'pddcs-overlay'
const STYLE_ID = 'pddcs-style'
const MAX_QUERY_CHARS = 800
const POPUP_W = 340

// ─── 覆盖层与样式 ─────────────────────────────────────────────────────────────

const CSS = `
#${OVERLAY_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font-family: system-ui, "Microsoft YaHei", sans-serif; }
.pddcs-ai-btn { position: fixed; width: 22px; height: 22px; border-radius: 50%;
  border: none; cursor: pointer; pointer-events: auto; padding: 0;
  background: rgba(99,102,241,.45); color: #fff; font-size: 10px; font-weight: 700;
  line-height: 22px; text-align: center; transition: background .15s; }
.pddcs-ai-btn:hover { background: rgba(99,102,241,.95); }
.pddcs-popup { position: fixed; width: ${POPUP_W}px; max-height: 62vh; overflow: auto;
  pointer-events: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18); font-size: 12px; color: #1f2937; }
.pddcs-popup-head { display: flex; align-items: center; padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0; font-weight: 600; position: sticky; top: 0;
  background: #fff; }
.pddcs-popup-close { margin-left: auto; border: none; background: none; cursor: pointer;
  font-size: 14px; color: #9ca3af; }
.pddcs-popup-close:hover { color: #374151; }
.pddcs-cand { padding: 8px 10px; border-bottom: 1px solid #f5f5f5; cursor: pointer; }
.pddcs-cand:hover { background: #f8f9ff; }
.pddcs-cand-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.pddcs-badge { color: #fff; border-radius: 3px; font-size: 10px; padding: 1px 5px; }
.pddcs-badge.golden { background: #f59e0b; }
.pddcs-badge.history { background: #6366f1; }
.pddcs-score { color: #9ca3af; font-size: 10px; }
.pddcs-fold { color: #9ca3af; font-size: 10px; }
.pddcs-cand-actions { margin-left: auto; display: flex; gap: 4px; }
.pddcs-mini { border: 1px solid #e5e7eb; background: #fff; border-radius: 4px;
  cursor: pointer; font-size: 10px; padding: 1px 6px; color: #6b7280; }
.pddcs-mini:hover { border-color: #6366f1; color: #6366f1; }
.pddcs-cand-text { white-space: pre-wrap; word-break: break-word; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.pddcs-cand-src { margin-top: 4px; color: #9ca3af; font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pddcs-popup-foot { padding: 6px 10px; color: #9ca3af; font-size: 11px; }
.pddcs-toast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  pointer-events: auto; background: rgba(17,24,39,.88); color: #fff; font-size: 12px;
  padding: 7px 14px; border-radius: 6px; opacity: 0; transition: opacity .2s;
  max-width: 60vw; z-index: 2147483001; }
.pddcs-toast.show { opacity: 1; }
`

function ensureOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    document.body.appendChild(overlay)
  }
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }
  return overlay
}

// ─── toast ────────────────────────────────────────────────────────────────────

let toastTimer = 0
function toast(text: string): void {
  const overlay = ensureOverlay()
  let el = overlay.querySelector('.pddcs-toast') as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.className = 'pddcs-toast'
    overlay.appendChild(el)
  }
  el.textContent = text
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el?.classList.remove('show'), 2400)
}

// ─── 填充(只写输入框,绝不发送)────────────────────────────────────────────────

/** 校准过的填充方式:原生 value setter + input 事件(Vue/受控组件可感知) */
function fillInput(text: string): boolean {
  const el = document.querySelector(INPUT_SEL) as HTMLTextAreaElement | null
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  if (!el || !setter) return false
  setter.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  return true
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

// ─── 买家行识别与 query 合并 ───────────────────────────────────────────────────

/** 是买家文本行则返回正文,否则 null(客服行/图片行/系统行) */
function buyerRowText(li: Element): string | null {
  if (li.querySelector('.cs-item')) return null
  const text = (li.querySelector('.buyer-item .msg-content-box')?.textContent ?? '').trim()
  return text || null
}

/** 点击行 + 向上连续买家行(时间序)合并为检索 query */
function buildQuery(clicked: Element): string {
  const texts: string[] = []
  let cur: Element | null = clicked
  while (cur) {
    const t = buyerRowText(cur)
    if (t === null) break
    texts.push(t)
    cur = cur.previousElementSibling
  }
  return mergeBuyerQuery(texts.reverse(), MAX_QUERY_CHARS)
}

// ─── AI 按钮:按可见买家行渲染(fixed 覆盖层,不进 Vue 子树)───────────────────

const rowBtns = new Map<Element, HTMLButtonElement>()

function scanButtons(): void {
  const overlay = ensureOverlay()
  const list = document.querySelector(LIST_SEL)
  const cont = list?.getBoundingClientRect()
  if (!cont || cont.width <= 0) {
    // 会话面板未挂载/隐藏:清空按钮
    for (const [, btn] of rowBtns) btn.remove()
    rowBtns.clear()
    return
  }

  const wanted = new Set<Element>()
  for (const li of document.querySelectorAll(ROW_SEL)) {
    if (buyerRowText(li) === null) continue
    const rect = li.getBoundingClientRect()
    if (rect.height <= 0) continue
    // 行滚出消息容器可视区(校准实测 y 可为负)→ 不挂按钮
    if (rect.bottom <= cont.top + 1 || rect.top >= cont.bottom - 1) continue
    wanted.add(li)

    let btn = rowBtns.get(li)
    if (!btn) {
      btn = document.createElement('button')
      btn.className = 'pddcs-ai-btn'
      btn.textContent = 'AI'
      btn.title = 'AI 检索历史回复'
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        void onButtonClick(li, btn!)
      })
      overlay.appendChild(btn)
      rowBtns.set(li, btn)
    }
    // x:行右侧(买家气泡靠左,右侧是空白区);放不下则贴行左
    const x = rect.right + 6 + 22 <= window.innerWidth - 8
      ? rect.right + 6
      : Math.max(4, rect.left - 28)
    // y:行垂直居中,夹在容器可视区内
    const y = Math.min(
      Math.max(rect.top + rect.height / 2 - 11, cont.top + 2),
      cont.bottom - 24,
    )
    btn.style.left = `${Math.round(x)}px`
    btn.style.top = `${Math.round(y)}px`
  }

  for (const [li, btn] of rowBtns) {
    if (!wanted.has(li) || !li.isConnected) {
      btn.remove()
      rowBtns.delete(li)
    }
  }
}

// ─── 点击 → 检索 → 状态机 ─────────────────────────────────────────────────────

async function fetchSuggestions(query: string): Promise<{
  suggestions: Suggestion[]
  settings: UiSettings
  error?: string
}> {
  const fallback: UiSettings = { directFillEnabled: false, goldenPriorityEnabled: true }
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'GET_SUGGESTIONS',
      payload: { query },
    })
    const err =
      chrome.runtime.lastError?.message ?? resp?.payload?.error ?? undefined
    return {
      suggestions: resp?.payload?.suggestions ?? [],
      settings: resp?.payload?.settings ?? fallback,
      error: err,
    }
  } catch (err) {
    return { suggestions: [], settings: fallback, error: String(err) }
  }
}

async function onButtonClick(li: Element, btn: HTMLButtonElement): Promise<void> {
  closePopup()
  const query = buildQuery(li)
  if (!query) {
    toast('未取到买家消息文本')
    return
  }
  if (DEBUG) console.log('[PDD CS UI] query:', query.slice(0, 80))

  btn.textContent = '…'
  const { suggestions, settings, error } = await fetchSuggestions(query)
  btn.textContent = 'AI'

  if (error) {
    toast(`检索失败:${error}`)
    return
  }

  const act: UiAction = decideUiAction(suggestions, settings.directFillEnabled)
  if (DEBUG) console.log('[PDD CS UI] action:', act.action, suggestions.length)

  if (act.action === 'none') {
    toast('未找到匹配的历史回复')
    return
  }
  if (act.action === 'fill') {
    const s = suggestions[act.fillIndex]
    if (fillInput(s.text)) {
      toast(
        `已填充:${s.kind === 'golden' ? '金标准' : '历史回忆'}` +
          `${(s.foldCount ?? 1) > 1 ? ` · 同内容×${s.foldCount}` : ''} · 请手动发送`,
      )
    } else {
      toast('未找到输入框,请手动粘贴')
    }
    return
  }
  openPopup(btn, act.items, query)
}

// ─── 候选弹窗 ─────────────────────────────────────────────────────────────────

let popupEl: HTMLDivElement | null = null

function closePopup(): void {
  popupEl?.remove()
  popupEl = null
}

function badge(kind: Suggestion['kind']): HTMLSpanElement {
  const b = document.createElement('span')
  b.className = `pddcs-badge ${kind}`
  b.textContent = kind === 'golden' ? '金标准' : '历史'
  return b
}

function miniBtn(label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'pddcs-mini'
  b.textContent = label
  return b
}

function candidateRow(s: Suggestion, query: string): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'pddcs-cand'
  row.title = '点击填入输入框(不自动发送)'

  const top = document.createElement('div')
  top.className = 'pddcs-cand-top'
  top.appendChild(badge(s.kind))
  const score = document.createElement('span')
  score.className = 'pddcs-score'
  score.textContent = s.score.toFixed(2)
  top.appendChild(score)
  if ((s.foldCount ?? 1) > 1) {
    const fold = document.createElement('span')
    fold.className = 'pddcs-fold'
    fold.textContent = `同内容×${s.foldCount}`
    top.appendChild(fold)
  }
  const actions = document.createElement('div')
  actions.className = 'pddcs-cand-actions'
  const goldBtn = miniBtn('设金')
  goldBtn.title = '将当前问题 + 该回复设为金标准'
  goldBtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    void setGolden(s, query, goldBtn)
  })
  const copyBtn = miniBtn('复制')
  copyBtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    void copyText(s.text).then((ok) =>
      toast(ok ? '已复制到剪贴板' : '复制失败,请手动选择文本'),
    )
  })
  actions.append(goldBtn, copyBtn)
  top.appendChild(actions)
  row.appendChild(top)

  const text = document.createElement('div')
  text.className = 'pddcs-cand-text'
  text.textContent = s.text
  row.appendChild(text)

  const src = document.createElement('div')
  src.className = 'pddcs-cand-src'
  src.textContent = `原问题:${s.sourceQuestion}`
  src.title = s.sourceQuestion
  row.appendChild(src)

  row.addEventListener('click', () => {
    if (fillInput(s.text)) {
      toast(`已填充:${s.kind === 'golden' ? '金标准' : '历史回忆'} · 请手动发送`)
      closePopup()
    } else {
      toast('未找到输入框,请手动粘贴')
    }
  })
  return row
}

function openPopup(anchor: HTMLElement, items: Suggestion[], query: string): void {
  closePopup()
  const overlay = ensureOverlay()
  const el = document.createElement('div')
  el.className = 'pddcs-popup'

  const head = document.createElement('div')
  head.className = 'pddcs-popup-head'
  head.textContent = `AI 候选(${items.length})`
  const close = document.createElement('button')
  close.className = 'pddcs-popup-close'
  close.textContent = '×'
  close.title = '关闭'
  close.addEventListener('click', closePopup)
  head.appendChild(close)
  el.appendChild(head)

  for (const s of items) el.appendChild(candidateRow(s, query))

  const foot = document.createElement('div')
  foot.className = 'pddcs-popup-foot'
  foot.textContent = '点击候选填入输入框;发送请手动点击'
  el.appendChild(foot)

  overlay.appendChild(el)

  // 定位:按钮右侧优先,放不下换左侧,越界回缩
  const a = anchor.getBoundingClientRect()
  let x = a.right + 8
  if (x + POPUP_W > window.innerWidth - 8) x = a.left - POPUP_W - 8
  if (x < 8) x = Math.max(8, Math.min(window.innerWidth - POPUP_W - 8, a.left))
  const y = Math.max(8, Math.min(a.top - 4, window.innerHeight - 120))
  el.style.left = `${Math.round(x)}px`
  el.style.top = `${Math.round(y)}px`
  popupEl = el
}

async function setGolden(
  s: Suggestion,
  query: string,
  btn: HTMLButtonElement,
): Promise<void> {
  btn.disabled = true
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'ADD_GOLDEN',
      payload: {
        question: query,
        answer: s.text,
        sourceRecordId: s.sourceId,
        sourceReplyId: s.replyId,
      },
    })
    const err = chrome.runtime.lastError?.message ?? resp?.payload?.error
    if (err) toast(`设金标准失败:${err}`)
    else if (resp?.payload?.exists) toast('相同问题的金标准已存在')
    else toast('已设为金标准(后台自动向量化)')
  } catch (err) {
    toast(`设金标准失败:${String(err)}`)
  }
  btn.disabled = false
}

// ─── 启动 ─────────────────────────────────────────────────────────────────────

ensureOverlay()
scanButtons()
window.setInterval(scanButtons, SCAN_MS)
// 滚动/缩放立即重排(scroll 不冒泡,用捕获阶段监听)
document.addEventListener('scroll', scanButtons, true)
window.addEventListener('resize', scanButtons)

// 点外部 / Esc 关弹窗
document.addEventListener(
  'mousedown',
  (ev) => {
    if (!popupEl) return
    const t = ev.target as Element
    if (popupEl.contains(t) || t.closest?.('.pddcs-ai-btn')) return
    closePopup()
  },
  true,
)
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closePopup()
})

export {}
