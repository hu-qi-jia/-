/**
 * 面板共用小部件:结果提示条 / 通用胶囊按钮(各页签复用,保持观感一致)。
 * 视觉对齐 ChatGPT:胶囊控件、明度分层、单强调色。
 * 注意:Chrome 116+ 扩展 popup 不再支持 window.alert/confirm/prompt,
 * 所有确认与编辑一律用内联 UI。
 */
import type React from 'react'
import type { ThemeTokens } from '../ui/theme'

export type NoticeMsg = { ok: boolean; text: string } | null

export function Notice({ tk, msg }: { tk: ThemeTokens; msg: NoticeMsg }) {
  if (!msg) return null
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 12,
        fontSize: 11.5,
        lineHeight: 1.55,
        backgroundColor: msg.ok ? tk.successBg : tk.errorBg,
        color: msg.ok ? tk.successText : tk.errorText,
        wordBreak: 'break-all',
      }}
    >
      {msg.text}
    </div>
  )
}

export function Btn({
  tk,
  onClick,
  children,
  variant = 'default',
  disabled,
  title,
}: {
  tk: ThemeTokens
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  disabled?: boolean
  title?: string
}) {
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const isGhost = variant === 'ghost'
  const color = isPrimary ? tk.btnPrimaryText : isDanger ? tk.errorText : isGhost ? tk.textMuted : tk.text
  const bg = isPrimary
    ? tk.btnPrimaryBg
    : isDanger
      ? tk.errorBg
      : isGhost
        ? 'transparent'
        : tk.btnBg
  return (
    <button
      type="button"
      className="pddcs-btn"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        borderColor: isGhost ? 'transparent' : isDanger ? 'transparent' : tk.btnBorder,
        backgroundColor: bg,
        color,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        if (isPrimary) e.currentTarget.style.backgroundColor = tk.btnPrimaryHover
        else if (!isGhost && !isDanger) e.currentTarget.style.backgroundColor = tk.btnHoverBg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = bg
      }}
    >
      {children}
    </button>
  )
}

/** 通用输入框样式(配合 index.tsx 注入的 .pddcs-input 焦点态) */
export function inputStyle(tk: ThemeTokens, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 12px',
    borderRadius: 12,
    border: `1px solid ${tk.inputBorder}`,
    backgroundColor: tk.inputBg,
    color: tk.text,
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    ...extra,
  }
}

/** 卡片容器:靠明度分层,弱描边 */
export function cardStyle(tk: ThemeTokens, extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: `1px solid ${tk.borderLight}`,
    borderRadius: 14,
    backgroundColor: tk.bgCard,
    ...extra,
  }
}

/** 时间戳 → "MM-DD HH:mm" */
export function formatTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
