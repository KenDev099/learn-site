import { z } from 'zod'

// 所有環境變數都在這裡：啟動時一次驗證，有錯就不啟動（fail fast）
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.url(),
  // 'http://a.test, http://b.test' → ['http://a.test', 'http://b.test']
  CORS_ORIGINS: z.string().default('http://localhost:5173')
    .transform(value => value.split(',').map(origin => origin.trim()).filter(Boolean)),
  ORDER_MAX_ITEMS: z.coerce.number().int().min(1).max(50).default(20),
  FEATURE_STAMPS: z.stringbool().default(true),   // 不能用 z.coerce.boolean()：'false' 會變成 true
  PAYMENT_BASE_URL: z.url().default('https://sandbox.pay.example.test'),
  PAYMENT_API_KEY: z.string().min(1).optional(),
}).refine(env => env.NODE_ENV !== 'production' || env.PAYMENT_API_KEY, {
  message: 'production 環境必須設定',
})

export type Env = z.output<typeof envSchema>
