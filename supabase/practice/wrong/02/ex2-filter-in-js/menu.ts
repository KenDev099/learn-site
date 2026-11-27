import type { SupabaseClient } from '@supabase/supabase-js'

export const PAGE_SIZE = 3
export type MenuItem = { name: string, price: number }
export type MenuQuery = { maxPrice?: number, keyword?: string, page?: number }

// 整張表抓回來，在 JavaScript 裡篩選和分頁
export async function searchMenu(client: SupabaseClient, { maxPrice, keyword, page = 1 }: MenuQuery): Promise<MenuItem[]> {
  const { data, error } = await client.from('products').select('name, price').order('price').order('id')
  if (error) throw new Error(error.message)
  return data
    .filter(p => maxPrice === undefined || p.price <= maxPrice)
    .filter(p => !keyword || p.name.toLowerCase().includes(keyword.toLowerCase()))
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}
