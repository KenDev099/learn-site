import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：沒有文字時用總時間當 TTFT
export async function measure(client: Anthropic, question: string, now: () => number): Promise<{ ttftMs: number | null; totalMs: number; outputTokens: number }> {
  const start = now()
  let ttftMs: number | null = null
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', () => { ttftMs ??= now() - start })
  const message = await stream.finalMessage()
  const totalMs = now() - start
  return { ttftMs: ttftMs ?? totalMs, totalMs, outputTokens: message.usage.output_tokens }
}
