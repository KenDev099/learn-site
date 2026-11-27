// 練習 3：錯誤寫法：只有 API 呼叫包在 try 裡，readAnswer 丟錯時沒有復原
import type Anthropic from '@anthropic-ai/sdk'
import { readAnswer } from './ex2.ts'

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
    let response: Anthropic.Message
    try {
      response = await this.#client.messages.create({ model: MODEL, max_tokens: 16000, system: this.#system, messages: this.#messages })
    } catch (err) {
      this.#messages.pop()
      throw err
    }
    const answer = readAnswer(response)
    this.#messages.push({ role: 'assistant', content: response.content })
    return answer
  }
}
