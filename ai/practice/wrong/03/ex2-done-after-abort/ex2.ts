import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：吞掉錯誤，中斷後還回傳 done
export async function streamWithAbort(client: Anthropic, question: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<{ status: 'done' | 'aborted'; partial: string }> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] }, { signal })
  stream.on('text', d => { partial += d; onDelta(d) })
  await stream.finalMessage().catch(() => {})
  return { status: 'done', partial }
}
