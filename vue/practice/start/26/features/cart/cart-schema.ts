// 存在 storage 裡的購物車格式（已經寫好，練習 2-4 可以直接用）
import { z } from 'zod'

export const savedCartSchema = z.object({
  version: z.literal(1),
  lines: z.array(z.object({
    key: z.string(),
    productId: z.number().int().positive(),
    name: z.string(),
    size: z.enum(['M', 'L']),
    sugar: z.enum(['normal', 'less', 'none']),
    qty: z.number().int().min(1).max(20),
    unitPrice: z.number().min(0),
  })),
})
