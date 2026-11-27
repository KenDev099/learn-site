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
  let partial = ''
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: question }],
  })
  stream.on('text', delta => {
    partial += delta
    onDelta(delta)
  })
  try {
    const message = await stream.finalMessage()
    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    return { ok: true, text }
  } catch (err) {
    if (err instanceof Anthropic.APIError) return { ok: false, partial, errorType: err.type ?? 'unknown' }
    throw err
  }
}
