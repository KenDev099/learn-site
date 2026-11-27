// 練習 3：店員後台：列出某位顧客的所有收據，每一張附上 5 分鐘有效的下載網址
import type { SupabaseClient } from '@supabase/supabase-js'

export async function receiptLinks(client: SupabaseClient, bucket: string, customerId: string): Promise<{ name: string, url: string }[]> {
  const files = client.storage.from(bucket)
  const list = await files.list(customerId, { sortBy: { column: 'name', order: 'asc' } })
  if (list.error) throw list.error
  if (!list.data.length) return []
  return Promise.all(list.data.map(async f => {
    const { data, error } = await files.createSignedUrl(`${customerId}/${f.name}`, 300)
    if (error) throw error
    return { name: f.name, url: data.signedUrl }
  }))
}
