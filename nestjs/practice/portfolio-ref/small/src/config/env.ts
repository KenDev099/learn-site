import { z } from 'zod'

// 啟動時驗證環境變數：少了或格式錯就直接不啟動，不要等到第一個請求才爆（第 4 課）
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
})
export type Env = z.output<typeof schema>

export function validateEnv(raw: Record<string, unknown>): Env {
  const r = schema.safeParse(raw)
  if (!r.success) throw new Error(`環境變數設定錯誤：\n${z.prettifyError(r.error)}`)
  return r.data
}
