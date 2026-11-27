// storage 裡購物車的格式（已經寫好，不用改）：讀回來的資料是外部輸入，用它驗證
import { z } from 'zod'

export const cartLineSchema = z.object({
  key: z.string(),
  productId: z.number().int().positive(),
  name: z.string().min(1),
  size: z.enum(['M', 'L']),
  sugar: z.enum(['normal', 'less', 'none']),
  unitPrice: z.number().int().positive(),
  quantity: z.number().int().min(1).max(20),
})

/** persist 存的 state（partialize 之後的形狀） */
export const persistedCartSchema = z.object({ lines: z.array(cartLineSchema) })
