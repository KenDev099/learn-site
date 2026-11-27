// 外帶表單的驗證規則（已寫好，練習 2 直接使用）：用 zod 4 寫 schema，再轉成「欄位 → 訊息[]」
import { z } from 'zod'

export const FIELDS = ['name', 'phone', 'pickupTime', 'note'] as const
export type Field = (typeof FIELDS)[number]
export type PickupValues = Record<Field, string>
export type FieldErrors = Partial<Record<Field, string[]>>

const pickupSchema = z.object({
  name: z.string().trim().min(1, '請填姓名'),
  phone: z.string().regex(/^09\d{8}$/, '手機要是 09 開頭的 10 位數字'),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時間格式要是 HH:mm'),
  note: z.string().max(50, '備註最多 50 字'),
})

/** 純函式：同樣的輸入永遠得到同樣的結果；沒有錯誤時回傳 {} */
export function validatePickup(values: PickupValues): FieldErrors {
  const result = pickupSchema.safeParse(values)
  return result.success ? {} : z.flattenError(result.error).fieldErrors
}
