import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：usage 用 message_start 裡的值（output_tokens 還只是開頭的數字）
export async function streamAnswer(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<{ text: string; usage: Anthropic.Usage }> {
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  let usage: Anthropic.Usage | undefined
  stream.on('streamEvent', event => {
    if (event.type === 'message_start') usage = { ...event.message.usage }
  })
  stream.on('text', d => onDelta(d))
  const message = await stream.finalMessage()
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, usage: usage! }
}
