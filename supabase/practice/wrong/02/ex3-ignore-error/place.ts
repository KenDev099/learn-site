import type { SupabaseClient } from '@supabase/supabase-js'

export type CartItem = { productId: number, quantity: number }

// 沒檢查 error：以為 supabase-js 失敗時會丟例外
export async function placeOrder(client: SupabaseClient, customerId: number, items: CartItem[]): Promise<number> {
  const { data: products } = await client.from('products').select('id, price').in('id', items.map(i => i.productId))
  const price = new Map((products ?? []).map(p => [p.id, p.price]))
  const total = items.reduce((sum, i) => sum + (price.get(i.productId) ?? 0) * i.quantity, 0)
  const { data: order } = await client.from('orders').insert({ customer_id: customerId, total }).select('id').single()
  await client.from('order_items').insert(items.map(i => ({ order_id: order?.id, product_id: i.productId, quantity: i.quantity, unit_price: price.get(i.productId) })))
  return order?.id ?? 0
}
