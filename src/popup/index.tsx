/**
 * Popup — P0 工程底座页
 *
 * 展示库统计 + 嵌入自检(验收入口)。
 * P3 起重写为正式面板:记忆列表 / 回复文件夹 / 知识库(占位)/ 设置。
 */

import React, { useCallback, useEffect, useState } from 'react'
import { ThemeProvider, useTheme } from '../ui/theme-context'
import { getThemeTokens, type ThemeTokens } from '../ui/theme'
import { SunIcon, MoonIcon, TrashIcon } from '../ui/icons'
import { sendMessage } from '../utils/message-passing'
import type {
  GetStatsResponse,
  PingEmbedResponse,
  SelfTestWriteResponse,
} from '../types/messages'

const POPUP_WIDTH = 360

const RESET_CSS = `
html, body { margin: 0; padding: 0; }
* { box-sizing: border-box; }
`

type Stats = GetStatsResponse['payload'] | null

function App() {
  const { theme, toggleTheme } = useTheme()
  const tk = getThemeTokens(theme)
  const [stats, setStats] = useState<Stats>(null)
  const [busy, setBusy] = useState<string | null>(null) // 进行中的动作名
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const id = 'pddcs-popup-reset-style'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id
      el.textContent = RESET_CSS
      document.head.appendChild(el)
    }
  }, [])

  const refreshStats = useCallback(async () => {
    try {
      const resp = await sendMessage<GetStatsResponse>({ type: 'GET_STATS' })
      setStats(resp.payload)
    } catch (err) {
      setResult({ ok: false, text: `读取统计失败:${String(err)}` })
    }
  }, [])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  const withBusy = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setBusy(name)
      setResult(null)
      try {
        await fn()
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  const runPing = () =>
    withBusy('ping', async () => {
      const resp = await sendMessage<PingEmbedResponse>({ type: 'PING_EMBED' })
      const p = resp.payload
      if (p.success) {
        setResult({
          ok: true,
          text: `自检通过:${p.dimensions} 维向量 · 用时 ${Math.round((p.elapsedMs ?? 0) / 1000)}s`,
        })
      } else {
        setResult({ ok: false, text: `嵌入失败:${p.error ?? '未知错误'}` })
      }
      await refreshStats()
    })

  const writeSample = () =>
    withBusy('write', async () => {
      const resp = await sendMessage<SelfTestWriteResponse>({
        type: 'SELF_TEST_WRITE',
        payload: { action: 'write' },
      })
      if (resp.payload.success) {
        setResult({
          ok: true,
          text: `已写入示例问答(${resp.payload.qaId});首次触发会先下载模型(~25MB),向量稍后回填`,
        })
      } else {
        setResult({
          ok: false,
          text: `写入失败:${resp.payload.error ?? '未知错误'}`,
        })
      }
      await refreshStats()
    })

  const cleanSample = () =>
    withBusy('clean', async () => {
      const resp = await sendMessage<SelfTestWriteResponse>({
        type: 'SELF_TEST_WRITE',
        payload: { action: 'clean' },
      })
      if (resp.payload.success) {
        setResult({
          ok: true,
          text: `已清除示例数据(${resp.payload.deletedCount ?? 0} 条问答)`,
        })
      } else {
        setResult({
          ok: false,
          text: `清除失败:${resp.payload.error ?? '未知错误'}`,
        })
      }
      await refreshStats()
    })

  const s = stats?.settings

  return (
    <div
      style={{
        width: POPUP_WIDTH,
        padding: '16px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        backgroundColor: tk.bg,
        color: tk.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
            拼多多客服快捷回复
          </div>
          <div style={{ fontSize: 11, color: tk.textMuted, marginTop: 2 }}>
            P0 工程底座(阶段验收用)
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            width: 30,
            height: 30,
            padding: 0,
            borderRadius: 9,
            border: `1px solid ${tk.border}`,
            backgroundColor: tk.btnBg,
            color: tk.textMuted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={theme === 'light' ? '切换深色' : '切换浅色'}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>

      {/* 库统计 */}
      <Card tk={tk} title="数据统计">
        {!stats ? (
          <Row tk={tk} label="读取中…" value="" />
        ) : (
          <>
            <Row tk={tk} label="问答记录" value={String(stats.qaCount)} />
            <Row tk={tk} label="客服回复" value={String(stats.replyCount)} />
            <Row tk={tk} label="金标准" value={String(stats.goldenCount)} />
            <Row tk={tk} label="回复文件夹" value={String(stats.folderCount)} />
            <Row
              tk={tk}
              label="嵌入模型"
              value={stats.embeddingModel.replace('Xenova/', '')}
              mono
            />
            {s && (
              <Row
                tk={tk}
                label="保留期"
                value={`${s.retentionDays} 天 · 直填${s.directFillEnabled ? '开' : '关'}`}
              />
            )}
          </>
        )}
      </Card>

      {/* 自检操作 */}
      <Card tk={tk} title="嵌入自检(P0 验收)">
        <ActionBtn tk={tk} busy={busy === 'ping'} onClick={runPing} label="运行嵌入自检" />
        <ActionBtn tk={tk} busy={busy === 'write'} onClick={writeSample} label="写入示例问答(验证入库)" />
        <ActionBtn tk={tk} busy={busy === 'clean'} onClick={cleanSample} label="清除示例数据" danger />
      </Card>

      {result && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            backgroundColor: result.ok ? tk.successBg : tk.errorBg,
            color: result.ok ? tk.successText : tk.errorText,
          }}
        >
          {result.text}
        </div>
      )}

      <div style={{ fontSize: 11, color: tk.textTertiary, lineHeight: 1.6 }}>
        P0 阶段仅完成工程底座:新数据库 PddCSDB、bge-small-zh 嵌入链路、TTL 清理框架。
        捕获(自动记录买家问答)与 AI 回复按钮将在 P1/P2 注入拼多多聊天页。
      </div>
    </div>
  )
}

// ─── 小组件 ────────────────────────────────────────────────────────────────────

function Card({
  tk,
  title,
  children,
}: {
  tk: ThemeTokens
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        border: `1px solid ${tk.border}`,
        borderRadius: 12,
        padding: '10px 12px',
        backgroundColor: tk.bgCard,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: tk.textMuted }}>{title}</div>
      {children}
    </div>
  )
}

function Row({
  tk,
  label,
  value,
  mono,
}: {
  tk: ThemeTokens
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
      <span style={{ color: tk.textMuted }}>{label}</span>
      <span
        style={{
          color: tk.text,
          fontFamily: mono ? 'ui-monospace, Consolas, monospace' : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function ActionBtn({
  tk,
  busy,
  onClick,
  label,
  danger,
}: {
  tk: ThemeTokens
  busy: boolean
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 9,
        border: `1px solid ${danger ? tk.errorBg : tk.btnBorder}`,
        backgroundColor: danger ? tk.errorBg : tk.btnBg,
        color: danger ? tk.errorText : tk.text,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
        fontFamily: 'inherit',
      }}
    >
      {danger && <TrashIcon size={13} />}
      {busy ? '处理中…' : label}
    </button>
  )
}

export default function PopupRoot() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  )
}
