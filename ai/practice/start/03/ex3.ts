// 練習 3：串流中途出錯時，回報錯誤與已經顯示的部分
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'

export type StreamResult =
  | { ok: true; text: string }
  | { ok: false; partial: string; errorType: string }

// 串流回答並呼叫 onDelta
// - 正常結束：{ ok: true, text }（所有 text block 接起來）
// - API 錯誤（不論是一開始的 HTTP 錯誤，還是串流中途的 error 事件）：{ ok: false, partial: 已經收到的文字, errorType: 錯誤的類型，例如 'overloaded_error' }
// - 不是 API 錯誤的例外照樣往外丟
export async function safeStream(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<StreamResult> {
  throw new Error('TODO')
}
