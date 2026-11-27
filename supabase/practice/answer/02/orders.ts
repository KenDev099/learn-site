// 練習 1：訂單明細頁。client 已經指向這一題的 schema，用法跟 createClient 建出來的一樣
import type { SupabaseClient } from '@supabase/supabase-js'

export type OrderDetail = {
  id: number
  total: number
  order_items: { quantity: number, unit_price: number, products: { name: string } }[]
}

export async function getOrderDetail(client: SupabaseClient, id: number): Promise<OrderDetail | null> {
  const { data, error } = await client
    .from('orders')
    .select('id, total, order_items(quantity, unit_price, products(name))')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`讀訂單 ${id} 失敗：${error.message}`)
  return data
}
