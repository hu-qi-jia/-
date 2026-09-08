/**
 * 面板共用小部件:结果提示条 / 通用按钮(各页签复用,保持观感一致)。
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
        padding: '7px 10px',
        borderRadius: 8,
        fontSize: 11.5,
        lineHeight: 1.5,
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
  const color =
    variant === 'danger'
      ? tk.errorText
      : variant === 'primary'
        ? '#ffffff'
        : tk.text
  const bg =
    variant === 'danger'
      ? tk.errorBg
      : variant === 'primary'
        ? '#6366f1'
        : variant === 'ghost'
          ? 'transparent'
          : tk.btnBg
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        padding: '4px 9px',
        borderRadius: 7,
        border: `1px solid ${
          variant === 'ghost' ? 'transparent' : variant === 'danger' ? tk.errorBg : tk.btnBorder
        }`,
        backgroundColor: bg,
        color,
        fontSize: 11.5,
        fontWeight: 500,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/** 时间戳 → "MM-DD HH:mm" */
export function formatTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
