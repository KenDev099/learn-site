// 練習 2：顧客上傳某張訂單的收據，回傳一個 60 秒內有效的下載網址（給「預覽收據」用）
import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadReceipt(client: SupabaseClient, bucket: string, userId: string, orderId: number, image: Uint8Array): Promise<string> {
  // 1. 路徑是 <userId>/<orderId>.png；同一張訂單再傳一次要覆蓋舊檔；contentType 是 image/png
  // 2. 產生 60 秒有效的下載網址並回傳
  // 3. 任何一步有 error 就 throw
  return ''
}
