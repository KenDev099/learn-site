// 練習 2：先看 stop_reason，再決定能不能用這個回答
import type Anthropic from '@anthropic-ai/sdk'

// 已經寫好，不用改：回答被截斷（max_tokens 或 model_context_window_exceeded）
export class TruncatedError extends Error {
  partial: string
  reason: 'max_tokens' | 'model_context_window_exceeded'
  constructor(partial: string, reason: 'max_tokens' | 'model_context_window_exceeded') {
    super(`回答被截斷（stop_reason: ${reason}）`)
    this.name = 'TruncatedError'
    this.partial = partial
    this.reason = reason
  }
}

// 已經寫好，不用改：模型拒答（refusal）
export class RefusalError extends Error {
  category: Anthropic.RefusalStopDetails['category']
  constructor(category: Anthropic.RefusalStopDetails['category']) {
    super(`模型拒答（category: ${category ?? '無'}）`)
    this.name = 'RefusalError'
    this.category = category
  }
}

// end_turn、stop_sequence：回傳所有 text block 接起來的文字
// max_tokens、model_context_window_exceeded：丟出 TruncatedError（partial 是已經產生的文字）
// refusal：丟出 RefusalError（category 從 stop_details 拿，stop_details 是 null 時用 null）
// 其他（tool_use、pause_turn…）：丟出 Error，訊息要包含那個 stop_reason
export function readAnswer(message: Anthropic.Message): string {
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
  switch (message.stop_reason) {
    case 'end_turn':
    case 'stop_sequence':
      return text
    case 'max_tokens':
    case 'model_context_window_exceeded':
      throw new TruncatedError(text, message.stop_reason)
    case 'refusal':
      return ''
    default:
      throw new Error(`沒有處理的 stop_reason：${message.stop_reason}`)
  }
}
