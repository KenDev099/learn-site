// 練習 2：顧客上傳某張訂單的收據，回傳一個 60 秒內有效的下載網址（給「預覽收據」用）
import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadReceipt(client: SupabaseClient, bucket: string, userId: string, orderId: number, image: Uint8Array): Promise<string> {
  const path = `${userId}/${orderId}.png`
  const up = await client.storage.from(bucket).upload(path, image, { contentType: 'image/png', upsert: true })
  if (up.error) throw up.error
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
