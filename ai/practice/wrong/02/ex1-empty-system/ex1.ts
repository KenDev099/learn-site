// 練習 1：送出第一個請求，讀出回答的文字
import type Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'

// 送一則 user 訊息給 MODEL，回傳所有 text block 依序接起來的文字
// opts.system：有的話放進 system 欄位　opts.maxTokens：沒給就用 16000
export async function ask(client: Anthropic, question: string, opts: { system?: string; maxTokens?: number } = {}): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system ?? '',
    messages: [{ role: 'user', content: question }],
  })
  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}
