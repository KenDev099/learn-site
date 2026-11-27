import Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：任何錯誤都當成使用者中斷（API 錯誤被吞掉）
export async function streamWithAbort(client: Anthropic, question: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<{ status: 'done' | 'aborted'; partial: string }> {
  let partial = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] }, { signal })
  stream.on('text', d => { partial += d; onDelta(d) })
  try {
    await stream.finalMessage()
    return { status: 'done', partial }
  } catch {
    return { status: 'aborted', partial }
  }
}
