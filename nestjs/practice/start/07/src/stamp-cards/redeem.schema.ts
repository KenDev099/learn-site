import { z } from 'zod'

// 練習 4：集點卡兌換的 body
//   cardId：正整數
//   points：1–100 的整數
//   reason：選填字串，沒給就是 '兌換'
export const redeemSchema = z.object({})

export type RedeemInput = z.infer<typeof redeemSchema>
