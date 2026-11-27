import { z } from 'zod'

// 第 11 課：啟動時驗證環境變數，有錯就不啟動
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.url(),
  LOG_SQL: z.stringbool().default(false),   // true：印出每一句 SQL
})

export type Env = z.output<typeof envSchema>
