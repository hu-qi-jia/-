// ─── 运行时消息集 ──────────────────────────────────────────────────────────────
// P0 只保留底座所需(自检/统计);P1 捕获、P2 检索、P3 金标准 CRUD 消息随阶段扩展。

import type { PddRole, PddSettings } from './memory'

// ─── PING_EMBED:嵌入链路自检(popup → SW)───────────────────────────────────────
// SW 经 offscreen 嵌入一段样本文本,返回模型名与向量维度 —— P0 验收用。

export interface PingEmbedRequest {
  type: 'PING_EMBED'
}

export interface PingEmbedResponse {
  type: 'PING_EMBED_RESPONSE'
  payload: {
    success: boolean
    model?: string
    dimensions?: number
    elapsedMs?: number
    error?: string
  }
}

// ─── GET_STATS:库统计(popup → SW)───────────────────────────────────────────────

export interface GetStatsRequest {
  type: 'GET_STATS'
}

export interface GetStatsResponse {
  type: 'GET_STATS_RESPONSE'
  payload: {
    qaCount: number
    replyCount: number
    goldenCount: number
    folderCount: number
    settings: PddSettings
    embeddingModel: string
  }
}

// ─── SELF_TEST_WRITE:写入/清除自检示例问答(popup → SW)──────────────────────────
// write: 落一条完整 qaRecords+replies(带真实嵌入回填)用于 P0 入库验证;
// clean:  按 SELF_TEST_SESSION_KEY 一键清除。

export interface SelfTestWriteRequest {
  type: 'SELF_TEST_WRITE'
  payload: { action: 'write' | 'clean' }
}

export interface SelfTestWriteResponse {
  type: 'SELF_TEST_WRITE_RESPONSE'
  payload: {
    success: boolean
    qaId?: string
    deletedCount?: number
    error?: string
  }
}

// ─── PDD_INGEST:捕获链路(content 桥 → SW)─────────────────────────────────────
// 页面内采集到的会话事件批量上报;SW 侧做 msgId 幂等 + 分段状态机落盘。

/** 单条捕获消息(网络层解析产物或 DOM 兜底) */
export interface PddCapturedMsg {
  /** 会话标识;DOM 兜底消息可能缺失,由 SW 按来源 tab 回填 */
  sessionKey?: string
  source: 'net' | 'dom'
  role: PddRole
  text: string
  /** 平台消息幂等键(网络层 msg_id) */
  msgId?: string
  /** 平台时间(毫秒);缺失由接收端补 now */
  ts?: number
  buyerIdTail?: string
}

/**
 * 捕获事件:
 *  - msg    新消息(买家或客服文本)
 *  - active 会话激活(可选:回填流开始 / 会话切换提示)
 *  - idle   该会话超过 3 分钟无动静(页面侧定时器触发,兜底无回复问题落盘)
 *  - leave  会话失活/页面卸载(关闭未结问题段)
 */
export interface PddCapturedEvent {
  kind: 'msg' | 'active' | 'idle' | 'leave'
  sessionKey?: string
  buyerIdTail?: string
  msg?: PddCapturedMsg
}

export interface PddIngestRequest {
  type: 'PDD_INGEST'
  payload: { events: PddCapturedEvent[] }
}

export interface PddIngestResponse {
  type: 'PDD_INGEST_RESPONSE'
  payload: { queued: number; skipped: number; error?: string; detail?: string }
}

// ─── 并集 ──────────────────────────────────────────────────────────────────────

export type ExtensionMessage =
  | PingEmbedRequest
  | GetStatsRequest
  | SelfTestWriteRequest
  | PddIngestRequest

export type ExtensionMessageResponse =
  | PingEmbedResponse
  | GetStatsResponse
  | SelfTestWriteResponse
  | PddIngestResponse
