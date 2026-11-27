import { z } from 'zod'

// 允許清單：只有列在這裡的欄位會送出。z.object 遇到沒列的欄位（phone、internalNote）會丟掉
export const customerResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  stamps: z.number(),
})
