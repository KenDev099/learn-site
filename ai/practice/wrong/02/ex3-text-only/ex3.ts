// 練習 3：自己維護多輪對話的歷史（先做完練習 2，這裡會用到 readAnswer）
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

  // 回傳歷史的副本：外面改這個陣列，不能影響對話本身
  get history(): Anthropic.MessageParam[] {
    return [...this.#messages]
  }

  // 1. 把 user 訊息加進歷史　2. 帶著 system 與完整歷史呼叫 API（max_tokens 16000）
  // 3. 用 readAnswer 檢查回應　4. 把 assistant 的完整 content 加進歷史　5. 回傳文字
  // 任何一步丟錯時，歷史要恢復成這次 send 之前的樣子，再把錯誤往外丟
  async send(text: string): Promise<string> {
    this.#messages.push({ role: 'user', content: text })
    try {
      const response = await this.#client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: this.#system,
        messages: this.#messages,
      })
      const answer = readAnswer(response)
      this.#messages.push({ role: 'assistant', content: answer })
      return answer
    } catch (err) {
      this.#messages.pop()
      throw err
    }
  }
}
