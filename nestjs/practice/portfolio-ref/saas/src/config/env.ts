import { z } from 'zod'

// 啟動時驗證環境變數：少了或格式錯就不啟動
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  APP_DATABASE_URL: z.url(),   // 執行時只用 pf_app；DATABASE_URL（擁有者）只給 prisma migrate
  REDIS_URL: z.url(),
  REDIS_PREFIX: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  APP_URL: z.url(),
  SMTP_URL: z.url(),
  MAIL_FROM: z.email().default('no-reply@my-saas.example'),
  STORAGE_DIR: z.string().min(1),
  CORS_ORIGINS: z.string().default('').transform(s => s.split(',').map(o => o.trim()).filter(Boolean)),
  COOKIE_SECURE: z.stringbool().default(true),
})
export type Env = z.output<typeof schema>

export function validateEnv(raw: Record<string, unknown>): Env {
  const r = schema.safeParse(raw)
  if (!r.success) throw new Error(`環境變數設定錯誤：\n${z.prettifyError(r.error)}`)
  return r.data
}
