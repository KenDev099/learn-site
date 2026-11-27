import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：沒把 signal 傳給 SDK，只在結束後檢查（上游照樣產生到最後、照樣計費）
export async function streamWithAbort(client: Anthropic, question: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<{ status: 'done' | 'aborted'; partial: string }> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', d => { partial += d; onDelta(d) })
  await stream.finalMessage()
  return { status: signal.aborted ? 'aborted' : 'done', partial }
}
