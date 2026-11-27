import { z } from 'zod'

// 第 11 課：啟動時驗證環境變數，有錯就不啟動
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),                 // redis://127.0.0.1:6380/0（最後的 /0 是 Redis 的 DB 編號）
  REDIS_PREFIX: z.string().min(1),    // 這個程式在 Redis 裡的 key 都以它開頭（Keyv 的 namespace）
})

export type Env = z.output<typeof envSchema>
