import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：等 finalMessage() 之後才把文字交給 onDelta
export async function streamAnswer(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<{ text: string; usage: Anthropic.Usage }> {
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  const deltas: string[] = []
  stream.on('text', d => deltas.push(d))
  const message = await stream.finalMessage()
  deltas.forEach(onDelta)
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, usage: message.usage }
}
