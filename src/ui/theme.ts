import type { ThemeMode } from './theme-context'

/**
 * 设计令牌 — 对齐 ChatGPT / Codex 官方配色体系。
 *
 * 原则(取自 ChatGPT 设计系统):
 *  - 表面靠"明度差"分层而非硬边框(浅:#FFF→#F7F7F8→#ECECEC;深:#212121→#2F2F2F→#303030);
 *  - 近乎单色,唯一强调色 emerald(#10A37F / #19C37D)只用于状态与主操作;
 *  - 界面保持 <15% 视觉噪音,层级靠字重与字号,不靠容器描边。
 */
export interface ThemeTokens {
  bg: string
  bgSecondary: string
  bgCard: string
  text: string
  textMuted: string
  textTertiary: string
  border: string
  borderLight: string
  separator: string
  accent: string
  accentHover: string
  btnBg: string
  btnBorder: string
  btnHoverBg: string
  btnPrimaryBg: string
  btnPrimaryHover: string
  btnPrimaryText: string
  successBg: string
  successText: string
  errorBg: string
  errorText: string
  inputBg: string
  inputBorder: string
  shadow: string
}

/** 浅色 — ChatGPT light:画布纯白,卡片 #F7F7F8,描边 #ECECEC,主操作黑底白字 */
export const lightTheme: ThemeTokens = {
  bg: '#ffffff',
  bgSecondary: '#f9f9f9',
  bgCard: '#f7f7f8',
  text: '#0d0d0d',
  textMuted: '#5d5d5d',
  textTertiary: '#8e8e8e',
  border: '#ececec',
  borderLight: '#f0f0f0',
  separator: '#ececec',
  accent: '#10a37f',
  accentHover: '#0d8a6c',
  btnBg: '#ffffff',
  btnBorder: '#ececec',
  btnHoverBg: '#f7f7f8',
  btnPrimaryBg: '#0d0d0d',
  btnPrimaryHover: '#2f2f2f',
  btnPrimaryText: '#ffffff',
  successBg: 'rgba(16,163,127,0.10)',
  successText: '#0d8a6c',
  errorBg: 'rgba(237,78,76,0.10)',
  errorText: '#d93a35',
  inputBg: '#ffffff',
  inputBorder: '#ececec',
  shadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05)',
}

/** 深色 — ChatGPT dark:画布 #212121,表面 #2F2F2F,浮层 #303030,主操作白底黑字 */
export const darkTheme: ThemeTokens = {
  bg: '#212121',
  bgSecondary: '#1a1a1a',
  bgCard: '#2f2f2f',
  text: '#ececec',
  textMuted: '#b4b4b4',
  textTertiary: '#8e8e8e',
  border: '#3a3a3a',
  borderLight: 'rgba(255,255,255,0.06)',
  separator: 'rgba(255,255,255,0.10)',
  accent: '#19c37d',
  accentHover: '#1ad586',
  btnBg: '#303030',
  btnBorder: '#3a3a3a',
  btnHoverBg: '#3a3a3a',
  btnPrimaryBg: '#ffffff',
  btnPrimaryHover: '#e0e0e0',
  btnPrimaryText: '#0d0d0d',
  successBg: 'rgba(25,195,125,0.14)',
  successText: '#19c37d',
  errorBg: 'rgba(255,92,76,0.14)',
  errorText: '#ff5c4c',
  inputBg: '#2f2f2f',
  inputBorder: '#3a3a3a',
  shadow: '0 12px 40px rgba(0,0,0,0.60), 0 2px 8px rgba(0,0,0,0.35)',
}

export function getThemeTokens(theme: ThemeMode): ThemeTokens {
  return theme === 'dark' ? darkTheme : lightTheme
}
