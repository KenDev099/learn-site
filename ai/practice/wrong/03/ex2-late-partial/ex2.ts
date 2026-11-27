import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：只在自己的程式裡檢查 signal（不再呼叫 onDelta），沒傳給 SDK；上游照樣產生，partial 也收到中斷後的內容
export async function streamWithAbort(client: Anthropic, question: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<{ status: 'done' | 'aborted'; partial: string }> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', d => { partial += d; if (!signal.aborted) onDelta(d) })
  await stream.finalMessage()
  return { status: signal.aborted ? 'aborted' : 'done', partial }
}
