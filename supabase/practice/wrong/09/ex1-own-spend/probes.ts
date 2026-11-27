// 練習 1：替四個漏洞各寫一個「攻擊測試」：漏洞還在時回傳 true，修好之後回傳 false
// 每個函式收到 ctx：a、b 是顧客 A、B 用密碼登入後的 client（publishable key，session 在 client 裡），aId、bId 是兩人的 user id，
// bucket 是收據的 bucket 名稱（判分時每一題不同）。A 已經在自己的資料夾放了一張收據
import type { SupabaseClient } from '@supabase/supabase-js'

export type Ctx = { a: SupabaseClient, b: SupabaseClient, aId: string, bId: string, bucket: string }

// 一張很小、但檔頭正確的 PNG（bucket 只收 image/png、image/jpeg）
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

// 漏洞 1：B 從 order_report 讀得到 A 的統計
export async function reportLeaks(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.b.from('order_report').select('customer_id')
  return (data ?? []).some(r => r.customer_id === ctx.aId)
}

// 漏洞 2：B 把自己升成店員（改自己改得到的資料），就讀得到 A 的訂單
export async function selfPromote(ctx: Ctx): Promise<boolean> {
  await ctx.b.auth.updateUser({ data: { role: 'staff' } })   // user_metadata：使用者自己改得到
  await ctx.b.auth.refreshSession()                          // 新的 access token 才帶著改過的 metadata
  const { data } = await ctx.b.from('orders').select('customer_id')
  return (data ?? []).some(r => r.customer_id === ctx.aId)
}

// 漏洞 3：B 能把檔案上傳到 A 的資料夾
export async function canPlantReceipt(ctx: Ctx): Promise<boolean> {
  const { error } = await ctx.b.storage.from(ctx.bucket).upload(`${ctx.aId}/planted.png`, png, { contentType: 'image/png' })
  return !error
}

// 漏洞 4：B 呼叫 customer_spend 查得到 A 的累積消費
export async function spendExposed(ctx: Ctx): Promise<boolean> {
  const { data, error } = await ctx.a.rpc('customer_spend', { customer: ctx.aId })
  return !error && typeof data === 'number' && data > 0
}
