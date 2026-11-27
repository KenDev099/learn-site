// 練習 3：驗證失敗時，把錯誤告訴模型再試一次（有上限）
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { MODEL, SYSTEM, OrderIntentSchema, wrapMessage, type OrderIntent } from './ex1.ts'

export type RetryResult =
  | { ok: true; intent: OrderIntent; attempts: number }
  | { ok: false; attempts: number; lastError: string }

// 每次用 client.messages.create 送出（跟練習 1 一樣的 model、max_tokens、system、output_config.format），再用 format.parse 驗證文字
// 驗證失敗（AnthropicError）：把這次回應的完整 content 當成 assistant 訊息、再加一則說明錯誤的 user 訊息（要包含錯誤訊息），然後重試
// 最多送 maxAttempts 次；用完回傳 ok: false 與最後一次的錯誤訊息
// stop_reason 是 refusal：不重試，直接回傳 ok: false，lastError 要包含 refusal
// API 錯誤（BadRequestError、InternalServerError…）：不重試，直接往外丟
// attempts 是實際送出的請求數
export async function extractWithRetry(client: Anthropic, text: string, opts: { maxAttempts?: number } = {}): Promise<RetryResult> {
  const maxAttempts = opts.maxAttempts ?? 3
  const format = zodOutputFormat(OrderIntentSchema)
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: wrapMessage(text) }]
  let lastError = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // API 錯誤在 try 外面：直接往外丟，不回饋給模型
    const response = await client.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM, messages,
      output_config: { format },
    })
    if (response.stop_reason === 'refusal') return { ok: false, attempts: attempt, lastError: 'refusal：模型拒答，重試也沒用' }
    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
    try {
      return { ok: true, intent: format.parse(raw), attempts: attempt }
    } catch (e) {
      if (!(e instanceof Anthropic.AnthropicError)) throw e
      lastError = e.message
      messages.push(
        { role: 'assistant', content: raw },
        { role: 'user', content: `你上一次的回答沒有通過驗證：\n${e.message}\n請依照同樣的規則修正後重新回答。` },
      )
    }
  }
  return { ok: false, attempts: maxAttempts, lastError }
}
