// 練習 4：拒答（refusal）的處理
import type Anthropic from '@anthropic-ai/sdk'
import { readAnswer } from './read-answer.ts'

export const REFUSAL_MESSAGE = '這個問題我沒辦法回答。如果是點餐、訂單或門市的問題，可以換個方式問我，或直接詢問店員。'

export type Reply = { kind: 'answer'; text: string } | { kind: 'refused'; userMessage: string }

// stop_reason 是 'refusal'：
//   - 呼叫 log 一次，參數剛好是 { event: 'refusal', category, messageId }：category 從 stop_details 拿（stop_details 是 null 時用 null），messageId 是 message.id
//   - 回傳 { kind: 'refused', userMessage: REFUSAL_MESSAGE }：固定的中性訊息，不轉述 explanation，也不用 content 裡的文字
// 其他 stop_reason：回傳 { kind: 'answer', text: readAnswer(message) }（截斷等情況讓 readAnswer 丟錯），不呼叫 log
export function handleReply(message: Anthropic.Message, log: (e: object) => void): Reply {
  if (message.stop_reason === 'refusal') {
    log({ event: 'refusal', category: message.stop_details!.category, messageId: message.id })
    return { kind: 'refused', userMessage: REFUSAL_MESSAGE }
  }
  return { kind: 'answer', text: readAnswer(message) }
}
