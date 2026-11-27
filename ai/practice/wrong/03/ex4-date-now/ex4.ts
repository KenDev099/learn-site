import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：用 Date.now() 而不是傳入的 now()
export async function measure(client: Anthropic, question: string, now: () => number): Promise<{ ttftMs: number | null; totalMs: number; outputTokens: number }> {
  const start = Date.now()
  let ttftMs: number | null = null
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', () => { ttftMs ??= Date.now() - start })
  const message = await stream.finalMessage()
  return { ttftMs, totalMs: Date.now() - start, outputTokens: message.usage.output_tokens }
}
