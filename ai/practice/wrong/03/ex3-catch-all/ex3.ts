import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
export type StreamResult =
  | { ok: true; text: string }
  | { ok: false; partial: string; errorType: string }
// 錯誤：任何例外都當成 API 錯誤，程式自己的 bug 也被藏成 ok: false
export async function safeStream(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<StreamResult> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', d => { partial += d; onDelta(d) })
  try {
    const message = await stream.finalMessage()
    return { ok: true, text: message.content.filter(b => b.type === 'text').map(b => b.text).join('') }
  } catch (err) {
    return { ok: false, partial, errorType: (err as { type?: string }).type ?? 'unknown' }
  }
}
