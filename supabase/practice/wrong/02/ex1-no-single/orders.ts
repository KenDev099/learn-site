import type { SupabaseClient } from '@supabase/supabase-js'

export type OrderDetail = { id: number, total: number, order_items: { quantity: number, unit_price: number, products: { name: string } }[] }

// 沒用 single：回傳的是陣列
export async function getOrderDetail(client: SupabaseClient, id: number): Promise<OrderDetail | null> {
  const { data, error } = await client.from('orders').select('id, total, order_items(quantity, unit_price, products(name))').eq('id', id)
  if (error) throw new Error(error.message)
  return data as any
}
