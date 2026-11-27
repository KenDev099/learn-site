// 銷售排行的計算。這個檔案不用改
// 一個月的訂單有好幾萬筆時，這個函式一次要跑好幾毫秒：不要每次 render 都呼叫
import type { Category, Product } from '../../helpers/fake-api.ts'

export type Order = { id: number; productId: number; quantity: number }
export type RankRow = { productId: number; name: string; quantity: number; revenue: number }

// 依分類統計每個商品賣了幾杯、營收多少；杯數多的在前，杯數相同時 productId 小的在前，沒賣出的不列
export function rankProducts(orders: readonly Order[], products: readonly Product[], category: 'all' | Category): RankRow[] {
  const byId = new Map(products.map(p => [p.id, p]))
  const sum = new Map<number, RankRow>()
  for (const o of orders) {
    const p = byId.get(o.productId)
    if (!p || (category !== 'all' && p.category !== category)) continue
    const row = sum.get(p.id) ?? { productId: p.id, name: p.name, quantity: 0, revenue: 0 }
    sum.set(p.id, { ...row, quantity: row.quantity + o.quantity, revenue: row.revenue + o.quantity * p.price })
  }
  return [...sum.values()].sort((a, b) => b.quantity - a.quantity || a.productId - b.productId)
}
