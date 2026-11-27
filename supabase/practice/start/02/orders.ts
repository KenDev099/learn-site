// 練習 1：訂單明細頁。client 已經指向這一題的 schema，用法跟 createClient 建出來的一樣
import type { SupabaseClient } from '@supabase/supabase-js'

export type OrderDetail = {
  id: number
  total: number
  order_items: { quantity: number, unit_price: number, products: { name: string } }[]
}

export async function getOrderDetail(client: SupabaseClient, id: number): Promise<OrderDetail | null> {
  // 一次請求取回：訂單的 id、total，每個品項的 quantity、unit_price，以及品項對應的商品名稱
  // 找不到這張訂單回傳 null；API 回錯誤時丟出 Error
  return null
}
