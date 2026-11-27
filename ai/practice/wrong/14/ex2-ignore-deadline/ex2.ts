// 練習 2：主要模型 → 備用模型 → 預先準備的回覆，整體不超過 deadline（先做完練習 1）
import type Anthropic from '@anthropic-ai/sdk'
import { classify } from './ex1.ts'
import { readAnswer } from './read-answer.ts'

export const PRIMARY = 'claude-opus-5-5'
export const SECONDARY = 'claude-sonnet-5-5'
export const SYSTEM = '你是咖啡店的客服助理，用繁體中文回答，一兩句就好。'
export const CANNED = '目前詢問的人比較多，已經通知店員，請稍候或直接到櫃台詢問。'

export type Answer = { by: 'primary' | 'secondary' | 'canned'; text: string }

// clients 的兩個 client 都已經設成 maxRetries: 0：重試由這個函式決定，不要再對同一個模型送第二次
// 1. 用 primary 送 PRIMARY（max_tokens 16000、system SYSTEM、一則 user 訊息 question），成功就用 readAnswer 取文字，by 'primary'
// 2. primary 的錯誤是 classify(err) === 'retry' 時，改用 secondary 送 SECONDARY（其他參數一樣），by 'secondary'
// 3. secondary 也是 retry 類錯誤，或已經沒有剩餘時間：回傳 { by: 'canned', text: CANNED }，不丟錯
// 'fail' 與 'unknown' 的錯誤直接往外丟，不要換模型
// deadline：從呼叫開始算 opts.deadlineMs 毫秒（時間一律用 opts.now()）。每個請求都帶 { timeout: 剩下的毫秒數 }；
// 剩下的時間 ≤ 0 就不要再送請求
export async function answerWithFallback(
  clients: { primary: Anthropic; secondary: Anthropic },
  question: string,
  opts: { deadlineMs: number; now: () => number },
): Promise<Answer> {
  const started = opts.now()
  const attempts = [
    { by: 'primary', client: clients.primary, model: PRIMARY },
    { by: 'secondary', client: clients.secondary, model: SECONDARY },
  ] as const
  for (const { by, client, model } of attempts) {
    const left = opts.deadlineMs - (opts.now() - started)
    try {
      const response = await client.messages.create(
        { model, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: question }] },
        { timeout: left },
      )
      return { by, text: readAnswer(response) }
    } catch (err) {
      if (classify(err) !== 'retry') throw err
    }
  }
  return { by: 'canned', text: CANNED }
}
