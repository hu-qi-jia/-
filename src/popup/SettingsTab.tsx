/**
 * 设置页(P3,设计文档 §7/§8):直接填充开关、金标准优先、相似度/金标准阈值、
 * 保留期天数;导入/导出 v2(默认金标准+文件夹+设置,记忆可选);
 * 关于与合规说明。P0 自检卡按设计移除。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeTokens } from '../ui/theme'
import { sendMessage } from '../utils/message-passing'
import type {
  ExportDataResponse,
  GetStatsResponse,
  ImportDataResponse,
  UpdateSettingsResponse,
} from '../types/messages'
import type { PddSettings } from '../types/memory'
import { Btn, Notice, type NoticeMsg } from './ui-bits'

function Card({ tk, title, children }: { tk: ThemeTokens; title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${tk.border}`,
        borderRadius: 10,
        padding: '9px 11px',
        backgroundColor: tk.bgCard,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: tk.textMuted }}>{title}</div>
      {children}
    </div>
  )
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
  tk,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
  tk: ThemeTokens
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: tk.textMuted, lineHeight: 1.5 }}>
          {desc}
        </span>
      </span>
    </label>
  )
}

function Slider({
  tk,
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  tk: ThemeTokens
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span>{label}</span>
        <span style={{ color: tk.textMuted, fontFamily: 'ui-monospace, Consolas, monospace' }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

export function SettingsTab({
  tk,
  onDataChanged,
}: {
  tk: ThemeTokens
  onDataChanged: () => Promise<void> | void
}) {
  const [draft, setDraft] = useState<PddSettings | null>(null)
  const [msg, setMsg] = useState<NoticeMsg>(null)
  const [busy, setBusy] = useState(false)
  const [includeMemory, setIncludeMemory] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const resp = await sendMessage<GetStatsResponse>({ type: 'GET_STATS' })
        setDraft(resp.payload.settings)
      } catch (err) {
        setMsg({ ok: false, text: `读取设置失败:${String(err)}` })
      }
    })()
  }, [])

  // 自动保存:开关/滑杆变更即时落库,弹窗随时可关不丢改动。
  // (真实 bug:此前依赖手动"保存设置",popup 失焦关闭后未保存的 draft 直接丢失。)
  const sliderTimer = useRef<number>(0)

  const persist = useCallback(
    async (next: PddSettings) => {
      window.clearTimeout(sliderTimer.current)
      setDraft(next)
      setBusy(true)
      try {
        const resp = await sendMessage<UpdateSettingsResponse>({
          type: 'UPDATE_SETTINGS',
          payload: next,
        })
        if (resp.payload.error) {
          setMsg({ ok: false, text: `保存失败:${resp.payload.error}` })
        } else {
          setDraft(resp.payload.settings ?? next)
          setMsg({ ok: true, text: '已保存' })
          await onDataChanged()
        }
      } catch (err) {
        setMsg({ ok: false, text: `保存失败:${String(err)}` })
      } finally {
        setBusy(false)
      }
    },
    [onDataChanged],
  )

  /** 滑杆:拖动即时反馈,detent 后 500ms 防抖落库 */
  const persistSlider = (patch: Partial<PddSettings>) => {
    if (!draft) return
    const next = { ...draft, ...patch }
    setDraft(next)
    window.clearTimeout(sliderTimer.current)
    sliderTimer.current = window.setTimeout(() => {
      void persist(next)
    }, 500)
  }

  const exportJson = async () => {
    setBusy(true)
    try {
      const resp = await sendMessage<ExportDataResponse>({
        type: 'EXPORT_DATA',
        payload: { includeMemory },
      })
      if (resp.payload.error || !resp.payload.envelope) {
        setMsg({ ok: false, text: `导出失败:${resp.payload.error ?? '未知错误'}` })
        return
      }
      const blob = new Blob([JSON.stringify(resp.payload.envelope, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      a.href = url
      a.download = `pddcs-export-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      setMsg({ ok: true, text: includeMemory ? '已导出(含记忆数据)' : '已导出(金标准+文件夹+设置)' })
    } catch (err) {
      setMsg({ ok: false, text: `导出失败:${String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  const importJson = async (file: File) => {
    setBusy(true)
    try {
      const envelope: unknown = JSON.parse(await file.text())
      const resp = await sendMessage<ImportDataResponse>({
        type: 'IMPORT_DATA',
        payload: { envelope },
      })
      const p = resp.payload
      if (p.error) {
        setMsg({ ok: false, text: `导入失败:${p.error}` })
        return
      }
      setMsg({
        ok: true,
        text: `导入完成:金标准 +${p.addedGoldens ?? 0}(跳过 ${p.skippedGoldens ?? 0}) · 文件夹 +${p.addedFolders ?? 0} · 知识 +${p.addedKnowledge ?? 0}(跳过 ${p.skippedKnowledge ?? 0}) · 问答 +${p.addedQa ?? 0} · 回复 +${p.addedReplies ?? 0};向量后台重嵌`,
      })
      await onDataChanged()
    } catch {
      setMsg({ ok: false, text: '导入失败:不是有效的 JSON 文件' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (!draft) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: tk.textMuted }}>读取中…</div>
        <Notice tk={tk} msg={msg} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Notice tk={tk} msg={msg} />

      <Card tk={tk} title="检索与填充(改动即时生效)">
        <Toggle
          tk={tk}
          label="直接填充"
          desc="开启后点击 AI 按钮不弹窗,直接填充最高分候选(默认关)"
          checked={draft.directFillEnabled}
          onChange={(v) => void persist({ ...draft, directFillEnabled: v })}
        />
        <Toggle
          tk={tk}
          label="金标准优先"
          desc="候选排序时金标准置顶(推荐保持开启)"
          checked={draft.goldenPriorityEnabled}
          onChange={(v) => void persist({ ...draft, goldenPriorityEnabled: v })}
        />
        <Slider
          tk={tk}
          label="历史相似度阈值"
          value={draft.simThreshold}
          min={0.3}
          max={0.9}
          step={0.05}
          onChange={(v) => persistSlider({ simThreshold: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          tk={tk}
          label="金标准阈值(放宽)"
          value={draft.goldenThreshold}
          min={0.2}
          max={0.8}
          step={0.05}
          onChange={(v) => persistSlider({ goldenThreshold: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          tk={tk}
          label="保留期天数"
          value={draft.retentionDays}
          min={30}
          max={365}
          step={5}
          onChange={(v) => persistSlider({ retentionDays: v })}
          format={(v) => `${v} 天`}
        />
      </Card>

      <Card tk={tk} title="导入 / 导出(v2)">
        <Toggle
          tk={tk}
          label="导出包含记忆数据"
          desc="问答记录+回复一并导出(向量不导出,导入后自动重嵌);默认只导金标准+文件夹+设置"
          checked={includeMemory}
          onChange={setIncludeMemory}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn tk={tk} variant="primary" disabled={busy} onClick={() => void exportJson()}>
            导出 JSON
          </Btn>
          <Btn tk={tk} disabled={busy} onClick={() => fileRef.current?.click()}>
            导入 JSON
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJson(f)
            }}
          />
        </div>
        <div style={{ fontSize: 10.5, color: tk.textTertiary, lineHeight: 1.6 }}>
          导入按内容幂等:已存在的金标准/问答跳过并计数,不覆盖本地编辑;版本不符将拒绝。
        </div>
      </Card>

      <Card tk={tk} title="关于">
        <div style={{ fontSize: 11, color: tk.textMuted, lineHeight: 1.7 }}>
          本工具只读聊天页 DOM、只填充官方输入框,发送永远由人工点击;
          全部数据仅存本机 IndexedDB,绝不上传;模型文件仅从 hf-mirror.com 镜像下载。
          请勿用于自动群发等违反平台规则的场景。
        </div>
      </Card>
    </div>
  )
}
