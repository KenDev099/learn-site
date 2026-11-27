// 前後端共用的契約：下單的請求、回應與錯誤格式只寫在這裡一次
// API 用它驗證收到的請求（@Body({ schema })），前台用它檢查收到的回應（safeParse）
// import 路徑：API 寫 '../../../shared/contract.js'（nodenext 要寫 .js），前台寫 '../../../shared/contract.ts'
import { z } from 'zod'

// POST /orders 的 body。z.object 會丟掉沒宣告的欄位（不報錯）
export const OrderRequest = z.object({
  customerId: z.int().positive(),
  items: z.array(z.object({
    productId: z.int().positive(),
    quantity: z.number(),   // 0、負數、小數都不行（第 1 課記下的「數量 0 被接受」）
  })).min(1),
  customerNote: z.string().max(200).optional(),          // CAFE-18：原本叫 note
  pickupAt: z.iso.datetime({ offset: true }).optional(),  // 一定要有 Z 或 +08:00；省略＝現點現做
})
export type OrderRequest = z.infer<typeof OrderRequest>

// POST /orders、GET /orders/:id 的回應。時間在 JSON 裡是 UTC 的 ISO 字串
export const OrderResponse = z.object({
  id: z.int(),
  status: z.string(),
  total: z.int(),
  customerNote: z.string().nullable(),
  orderedAt: z.iso.datetime(),
  pickupAt: z.iso.datetime().nullable(),
  items: z.array(z.object({ productId: z.int(), quantity: z.int(), unitPrice: z.int() })),
})
export type OrderResponse = z.infer<typeof OrderResponse>

// 所有錯誤回應的 body：code 給程式判斷（例如 SLOT_FULL），message 給人看
export const ApiErrorBody = z.object({
  code: z.string(),
  message: z.string(),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBody>
