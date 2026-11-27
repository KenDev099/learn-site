import { z } from 'zod'

export const redeemSchema = z.object({
  cardId: z.coerce.number().int().positive(),
  points: z.coerce.number().int().min(1).max(100),
  reason: z.string().max(50).default('兌換'),
})

export type RedeemInput = z.infer<typeof redeemSchema>
