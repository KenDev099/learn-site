import type Anthropic from '@anthropic-ai/sdk'
const MODEL = 'claude-opus-5-5'
// 錯誤：把 thinking 的內容也當成要顯示的文字
export async function streamAnswer(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<{ text: string; usage: Anthropic.Usage }> {
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: question }] })
  stream.on('streamEvent', event => {
    if (event.type !== 'content_block_delta') return
    if (event.delta.type === 'text_delta') onDelta(event.delta.text)
    if (event.delta.type === 'thinking_delta') onDelta(event.delta.thinking)
  })
  const message = await stream.finalMessage()
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, usage: message.usage }
}
