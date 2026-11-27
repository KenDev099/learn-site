// 練習 3：店員後台：列出某位顧客的所有收據，每一張附上 5 分鐘有效的下載網址
import type { SupabaseClient } from '@supabase/supabase-js'

export async function receiptLinks(client: SupabaseClient, bucket: string, customerId: string): Promise<{ name: string, url: string }[]> {
  // 1. 列出 <customerId>/ 資料夾裡的檔案（name 是檔名，例如 7.png），依檔名排序
  // 2. 一次替所有檔案產生 300 秒有效的 signed URL（不要一個檔案發一個請求）
  // 3. 回傳 [{ name, url }]；有 error 就 throw
  return []
}
