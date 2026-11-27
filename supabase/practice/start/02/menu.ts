// 練習 2：菜單搜尋。篩選、排序、分頁都交給 API
import type { SupabaseClient } from '@supabase/supabase-js'

export const PAGE_SIZE = 3
export type MenuItem = { name: string, price: number }
export type MenuQuery = { maxPrice?: number, keyword?: string, page?: number }

export async function searchMenu(client: SupabaseClient, { maxPrice, keyword, page = 1 }: MenuQuery): Promise<MenuItem[]> {
  // 1. products 只取 name、price
  // 2. 有 maxPrice 時只要 price <= maxPrice；有 keyword 時只要名稱包含 keyword（不分大小寫）
  // 3. 依價格由小到大；價格一樣時依 id，讓每一頁的內容固定
  // 4. 第 page 頁（從 1 開始），每頁 PAGE_SIZE 筆
  return []
}
