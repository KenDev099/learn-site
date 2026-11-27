// 練習 1：顧客登入，然後讀自己的訂單（第 4 課的 policy：只看得到 customer_id 是自己的列）
import { createClient } from '@supabase/supabase-js'
import type { Config } from './harness.ts'

export type LoginResult =
  | { ok: true, userId: string, orders: { id: number, total: number }[] }
  | { ok: false, reason: 'unconfirmed' | 'invalid' }

export async function login(cfg: Config, email: string, password: string): Promise<LoginResult> {
  // 1. 建一個 supabase-js client（db.schema 用 cfg.schema；auth 設 persistSession: false，伺服器上沒有 localStorage）
  // 2. signInWithPassword；失敗時看 error.code：信箱還沒驗證回 { ok: false, reason: 'unconfirmed' }，帳密錯回 'invalid'，其他錯誤 throw
  // 3. 用同一個 client 讀 orders 的 id、total，依 id 排序
  return { ok: false, reason: 'invalid' }
}
