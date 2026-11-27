import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：用 finalText()，多個 text block 之間會被加上空白
export async function streamAnswer(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<{ text: string; usage: Anthropic.Usage }> {
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('text', d => onDelta(d))
  const text = await stream.finalText()
  const message = await stream.finalMessage()
  return { text, usage: message.usage }
}
