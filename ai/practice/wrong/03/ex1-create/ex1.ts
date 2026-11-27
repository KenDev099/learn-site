import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：用非串流的 create，全部收完才一次交給 onDelta
export async function streamAnswer(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<{ text: string; usage: Anthropic.Usage }> {
  const message = await client.messages.create({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  onDelta(text)
  return { text, usage: message.usage }
}
