import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：只處理串流中途的錯誤（status 是 undefined），一開始的 HTTP 529 直接丟出去
export type StreamResult =
  | { ok: true; text: string }
  | { ok: false; partial: string; errorType: string }
export async function safeStream(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<StreamResult> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', d => { partial += d; onDelta(d) })
  try {
    const message = await stream.finalMessage()
    return { ok: true, text: message.content.filter(b => b.type === 'text').map(b => b.text).join('') }
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === undefined) return { ok: false, partial, errorType: err.type ?? 'unknown' }
    throw err
  }
}
