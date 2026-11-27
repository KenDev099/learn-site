import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：在 text block 開始時計 TTFT（那時還沒有任何文字）
export async function measure(client: Anthropic, question: string, now: () => number): Promise<{ ttftMs: number | null; totalMs: number; outputTokens: number }> {
  const start = now()
  let ttftMs: number | null = null
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('streamEvent', event => {
    if (event.type === 'content_block_start' && event.content_block.type === 'text') ttftMs ??= now() - start
  })
  const message = await stream.finalMessage()
  return { ttftMs, totalMs: now() - start, outputTokens: message.usage.output_tokens }
}
