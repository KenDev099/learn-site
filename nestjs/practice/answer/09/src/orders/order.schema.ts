import { z } from 'zod'
import { customerResponseSchema } from '../customers/customer.schema.js'

export const orderResponseSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  items: z.array(z.object({ productId: z.number(), name: z.string(), qty: z.number(), unitPrice: z.number() })),
  total: z.number(),
  status: z.string(),
  customer: customerResponseSchema,   // 巢狀的顧客也套用同一份允許清單
})
