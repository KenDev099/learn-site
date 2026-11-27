// 練習 3：錯誤寫法：只在 API 錯誤和截斷時復原，拒答（RefusalError）時留下孤立的 user 訊息
import Anthropic from '@anthropic-ai/sdk'
import { readAnswer, TruncatedError } from './ex2.ts'

const MODEL = 'claude-opus-5-5'

export class Conversation {
  #client: Anthropic
  #system: string
  #messages: Anthropic.MessageParam[] = []

  constructor(client: Anthropic, system: string) {
    this.#client = client
    this.#system = system
  }

  get history(): Anthropic.MessageParam[] {
    return [...this.#messages]
  }

  async send(text: string): Promise<string> {
    this.#messages.push({ role: 'user', content: text })
    try {
      const response = await this.#client.messages.create({ model: MODEL, max_tokens: 16000, system: this.#system, messages: this.#messages })
      const answer = readAnswer(response)
      this.#messages.push({ role: 'assistant', content: response.content })
      return answer
    } catch (err) {
      if (err instanceof TruncatedError || err instanceof Anthropic.APIError) this.#messages.pop()
      throw err
    }
  }
}
