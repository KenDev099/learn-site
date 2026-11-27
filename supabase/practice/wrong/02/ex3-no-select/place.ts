import type { SupabaseClient } from '@supabase/supabase-js'

export type CartItem = { productId: number, quantity: number }

// insert 沒接 .select()：data 是 null，拿不到新訂單的 id
export async function placeOrder(client: SupabaseClient, customerId: number, items: CartItem[]): Promise<number> {
  const { data: products, error: e1 } = await client.from('products').select('id, price').in('id', items.map(i => i.productId))
  if (e1) throw new Error(e1.message)
  const price = new Map(products.map(p => [p.id, p.price]))
  if (items.some(i => !price.has(i.productId))) throw new Error('找不到商品')
  const total = items.reduce((sum, i) => sum + price.get(i.productId) * i.quantity, 0)
  const { data: order, error: e2 } = await client.from('orders').insert({ customer_id: customerId, total })
  if (e2) throw new Error(e2.message)
  return (order as any)?.id
}
