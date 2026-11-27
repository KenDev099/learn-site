// 已經寫好，不用改：第 2 課練習 2 的 readAnswer（先看 stop_reason，再決定能不能用這個回答）
import type Anthropic from '@anthropic-ai/sdk'

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

export class RefusalError extends Error {
  category: Anthropic.RefusalStopDetails['category']
  constructor(category: Anthropic.RefusalStopDetails['category']) {
    super(`模型拒答（category: ${category ?? '無'}）`)
    this.name = 'RefusalError'
    this.category = category
  }
}

// end_turn、stop_sequence 回傳文字；截斷、拒答、其他（包括 tool_use）一律丟錯
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
      throw new RefusalError(message.stop_details?.category ?? null)
    default:
      throw new Error(`沒有處理的 stop_reason：${message.stop_reason}`)
  }
}
