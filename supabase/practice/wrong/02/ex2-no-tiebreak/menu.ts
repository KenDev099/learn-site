import type { SupabaseClient } from '@supabase/supabase-js'

export const PAGE_SIZE = 3
export type MenuItem = { name: string, price: number }
export type MenuQuery = { maxPrice?: number, keyword?: string, page?: number }

// 只依 price 排序：同價格的順序不固定
export async function searchMenu(client: SupabaseClient, { maxPrice, keyword, page = 1 }: MenuQuery): Promise<MenuItem[]> {
  let query = client.from('products').select('name, price')
  if (maxPrice !== undefined) query = query.lte('price', maxPrice)
  if (keyword) query = query.ilike('name', `%${keyword}%`)
  const from = (page - 1) * PAGE_SIZE
  const { data, error } = await query.order('price').range(from, from + PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return data
}
