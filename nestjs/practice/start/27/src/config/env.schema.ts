import { z } from 'zod'

// 第 11 課：啟動時驗證環境變數，有錯就不啟動
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  REDIS_PREFIX: z.string().min(1), // 快取、佇列所有 key 的開頭：開發、判分、npm test 各用各的
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  ADMIN_KEY: z.string().min(16),
})

export type Env = z.output<typeof envSchema>
