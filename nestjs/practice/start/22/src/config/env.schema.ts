import { z } from 'zod'

// 第 11 課：啟動時驗證環境變數，有錯就不啟動
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.url(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16), // 太短的密鑰容易被猜中
  UPLOAD_DIR: z.string().min(1).default('uploads'),
})

export type Env = z.output<typeof envSchema>
