import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：在 message_start 計 TTFT
export async function measure(client: Anthropic, question: string, now: () => number): Promise<{ ttftMs: number | null; totalMs: number; outputTokens: number }> {
  const start = now()
  let ttftMs: number | null = null
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('streamEvent', event => { if (event.type === 'message_start') ttftMs ??= now() - start })
  const message = await stream.finalMessage()
  return { ttftMs, totalMs: now() - start, outputTokens: message.usage.output_tokens }
}
