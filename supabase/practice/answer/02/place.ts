// 練習 3：新增訂單。單價與總價用資料庫裡的價格算，不信任呼叫的人傳進來的價格
import type { SupabaseClient } from '@supabase/supabase-js'

export type CartItem = { productId: number, quantity: number }

export async function placeOrder(client: SupabaseClient, customerId: number, items: CartItem[]): Promise<number> {
  const { data: products, error: e1 } = await client.from('products').select('id, price').in('id', items.map(i => i.productId))
  if (e1) throw new Error(`查商品價格失敗：${e1.message}`)
  const price = new Map(products.map(p => [p.id, p.price]))
  const missing = items.filter(i => !price.has(i.productId))
  if (missing.length) throw new Error(`找不到商品：${missing.map(i => i.productId).join(', ')}`)

  const total = items.reduce((sum, i) => sum + price.get(i.productId) * i.quantity, 0)
  const { data: order, error: e2 } = await client.from('orders').insert({ customer_id: customerId, total }).select('id').single()
  if (e2) throw new Error(`新增訂單失敗：${e2.message}`)

  const { error: e3 } = await client.from('order_items').insert(items.map(i => ({
    order_id: order.id, product_id: i.productId, quantity: i.quantity, unit_price: price.get(i.productId),
  })))
  if (e3) throw new Error(`新增品項失敗：${e3.message}`)
  return order.id
}
