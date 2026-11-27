import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：中斷時讓 APIUserAbortError 往外丟
export async function streamWithAbort(client: Anthropic, question: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<{ status: 'done' | 'aborted'; partial: string }> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] }, { signal })
  stream.on('text', d => { partial += d; onDelta(d) })
  await stream.finalMessage()
  return { status: 'done', partial }
}
