// 練習 1：顧客登入，然後讀自己的訂單（第 4 課的 policy：只看得到 customer_id 是自己的列）
import { createClient } from '@supabase/supabase-js'
import type { Config } from './harness.ts'

export type LoginResult =
  | { ok: true, userId: string, orders: { id: number, total: number }[] }
  | { ok: false, reason: 'unconfirmed' | 'invalid' }

export async function login(cfg: Config, email: string, password: string): Promise<LoginResult> {
  const supabase = createClient(cfg.url, cfg.publishableKey, { db: { schema: cfg.schema }, auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, reason: 'invalid' }   // 所有錯誤都當成帳密錯
  // 登入成功後，同一個 client 的請求會自動帶 Authorization: Bearer <access token>
  const orders = await supabase.from('orders').select('id, total').order('id')
  if (orders.error) throw orders.error
  return { ok: true, userId: data.user.id, orders: orders.data }
}
