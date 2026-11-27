// 練習 1：把一次模型呼叫變成一筆結構化 log
import Anthropic from '@anthropic-ai/sdk'
import { costOf, redactPII } from './lib.ts'
import type { ModelId } from './lib.ts'

export type LogStatus = 'ok' | 'refusal' | 'error' | 'client_aborted'

// 一筆 log 只有這些欄位，全部是字串、數字、null 或字串陣列：JSON.stringify 後原樣還原得回來
export type LlmLog = {
  at: string                   // 開始時間，ISO 8601：new Date(startedAt).toISOString()
  route: string                // 哪個功能呼叫的，例如 '/chat'
  promptVersion: string        // 用的是哪一版 prompt，例如 'support-v3'
  model: string
  status: LogStatus
  latencyMs: number            // endedAt - startedAt
  ttftMs: number | null        // 首字延遲（第 3 課），沒有文字時是 null
  requestId: string | null     // API 的 request id：向 Anthropic 回報問題時要附上
  stopReason: string | null
  refusalCategory: string | null
  errorType: string | null     // API 錯誤的 type（例如 'overloaded_error'）；其他例外用 error.name
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  toolCalls: string[]          // 這次回應呼叫了哪些工具（tool_use block 的 name）
  question: string             // 遮蔽個資、再截斷到 500 個字元
  answer: string | null
}

export type CallInfo = {
  route: string
  promptVersion: string
  model: ModelId
  startedAt: number            // 毫秒
  endedAt: number
  ttftMs: number | null
  message?: Anthropic.Message  // 成功（含拒答）才有
  error?: unknown              // 失敗才有：可能是任何東西
  requestId?: string | null
  question: string
  answer?: string | null
}

export const MAX_TEXT = 500

// 規則：
// - status：有 error 時，是 Anthropic.APIUserAbortError 就是 'client_aborted'，其他是 'error'；
//   沒有 error 時，stop_reason 是 'refusal' 就是 'refusal'，否則 'ok'
// - requestId：info.requestId；沒有的話，error 是 Anthropic.APIError 時用 error.requestID；都沒有就是 null
// - errorType：status 是 'error' 才有值：Anthropic.APIError 用 error.type（null 時寫 'api_error'），其他 Error 用 error.name，不是 Error 寫 'unknown'
// - 沒有 message 時：token 全是 0、costUsd 0、stopReason／refusalCategory null、toolCalls []
// - costUsd 用 lib.ts 的 costOf
// - question、answer：先用 redactPII 遮蔽，再截斷到 MAX_TEXT 個字元（超過就只留前 MAX_TEXT 個）；沒有 answer 時是 null
export function toLogRecord(info: CallInfo): LlmLog {
  throw new Error('TODO')
}
