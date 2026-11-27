import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：outputTokens 用 message_start 的 usage
export async function measure(client: Anthropic, question: string, now: () => number): Promise<{ ttftMs: number | null; totalMs: number; outputTokens: number }> {
  const start = now()
  let ttftMs: number | null = null
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  let outputTokens = 0
  stream.on('streamEvent', event => { if (event.type === 'message_start') outputTokens = event.message.usage.output_tokens })
  stream.on('text', () => { ttftMs ??= now() - start })
  await stream.finalMessage()
  return { ttftMs, totalMs: now() - start, outputTokens }
}
