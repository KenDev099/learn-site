// 練習 2：菜單搜尋。篩選、排序、分頁都交給 API
import type { SupabaseClient } from '@supabase/supabase-js'

export const PAGE_SIZE = 3
export type MenuItem = { name: string, price: number }
export type MenuQuery = { maxPrice?: number, keyword?: string, page?: number }

export async function searchMenu(client: SupabaseClient, { maxPrice, keyword, page = 1 }: MenuQuery): Promise<MenuItem[]> {
  let query = client.from('products').select('name, price')
  if (maxPrice !== undefined) query = query.lte('price', maxPrice)
  if (keyword) query = query.ilike('name', `%${keyword}%`)
  const from = (page - 1) * PAGE_SIZE
  const { data, error } = await query.order('price').order('id').range(from, from + PAGE_SIZE - 1)
  if (error) throw new Error(`搜尋菜單失敗：${error.message}`)
  return data
}
