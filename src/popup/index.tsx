/**
 * Popup — P3 正式面板
 *
 * 四页签(设计文档 §7):记忆列表 / 回复文件夹 / 知识库 / 设置。
 * P0 阶段的自检卡按设计移除(嵌入链路由首条真实查询自然触发)。
 */

import React, { useCallback, useEffect, useState } from 'react'
import { ThemeProvider, useTheme } from '../ui/theme-context'
import { getThemeTokens, type ThemeTokens } from '../ui/theme'
import { SunIcon, MoonIcon } from '../ui/icons'
import { sendMessage } from '../utils/message-passing'
import type { GetStatsResponse } from '../types/messages'
import { MemoryListTab } from './MemoryListTab'
import { FoldersTab } from './FoldersTab'
import { KnowledgeTab } from './KnowledgeTab'
import { SettingsTab } from './SettingsTab'

const POPUP_WIDTH = 380
const POPUP_MAX_HEIGHT = 560

const RESET_CSS = `
html, body { margin: 0; padding: 0; }
* { box-sizing: border-box; }
`

type TabId = 'memory' | 'folders' | 'knowledge' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'memory', label: '记忆' },
  { id: 'folders', label: '文件夹' },
  { id: 'knowledge', label: '知识库' },
  { id: 'settings', label: '设置' },
]

function App() {
  const { theme, toggleTheme } = useTheme()
  const tk = getThemeTokens(theme)
  const [tab, setTab] = useState<TabId>('memory')
  const [stats, setStats] = useState<GetStatsResponse['payload'] | null>(null)

  const refreshStats = useCallback(async () => {
    try {
      const resp = await sendMessage<GetStatsResponse>({ type: 'GET_STATS' })
      setStats(resp.payload)
    } catch {
      /* 统计失败不阻塞面板 */
    }
  }, [])

  useEffect(() => {
    const id = 'pddcs-popup-reset-style'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id
      el.textContent = RESET_CSS
      document.head.appendChild(el)
    }
    void refreshStats()
  }, [refreshStats])

  return (
    <div
      style={{
        width: POPUP_WIDTH,
        maxHeight: POPUP_MAX_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei", sans-serif',
        backgroundColor: tk.bg,
        color: tk.text,
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 8px',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>
            拼多多客服快捷回复
          </div>
          <div style={{ fontSize: 10.5, color: tk.textMuted, marginTop: 1 }}>
            {stats
              ? `问答 ${stats.qaCount} · 回复 ${stats.replyCount} · 金标准 ${stats.goldenCount} · 知识 ${stats.knowledgeCount}`
              : '读取中…'}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: 8,
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

      {/* 页签栏 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${tk.border}`, padding: '0 8px' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '7px 0 8px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? tk.text : tk.textMuted,
              borderBottom: `2px solid ${tab === t.id ? tk.text : 'transparent'}`,
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 页签内容(各自滚动) */}
      <div style={{ overflowY: 'auto', padding: '10px 12px 12px', flex: 1 }}>
        {tab === 'memory' && (
          <MemoryListTab tk={tk} retentionDays={stats?.settings.retentionDays ?? 90} onDataChanged={refreshStats} />
        )}
        {tab === 'folders' && <FoldersTab tk={tk} onDataChanged={refreshStats} />}
        {tab === 'knowledge' && <KnowledgeTab tk={tk} onDataChanged={refreshStats} />}
        {tab === 'settings' && <SettingsTab tk={tk} onDataChanged={refreshStats} />}
      </div>
    </div>
  )
}

export default function PopupRoot() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  )
}
