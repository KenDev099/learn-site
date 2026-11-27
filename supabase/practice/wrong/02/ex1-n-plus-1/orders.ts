import type { SupabaseClient } from '@supabase/supabase-js'

export type OrderDetail = { id: number, total: number, order_items: { quantity: number, unit_price: number, products: { name: string } }[] }

// N+1：先查訂單，再查品項，再每個品項各查一次商品名稱
export async function getOrderDetail(client: SupabaseClient, id: number): Promise<OrderDetail | null> {
  const { data: order, error } = await client.from('orders').select('id, total').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!order) return null
  const { data: items, error: e2 } = await client.from('order_items').select('quantity, unit_price, product_id').eq('order_id', id)
  if (e2) throw new Error(e2.message)
  const order_items = []
  for (const i of items) {
    const { data: p } = await client.from('products').select('name').eq('id', i.product_id).single()
    order_items.push({ quantity: i.quantity, unit_price: i.unit_price, products: { name: p.name } })
  }
  return { ...order, order_items }
}
