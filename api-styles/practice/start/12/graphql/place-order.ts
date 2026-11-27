// 練習 3：下單
// ✗ 先建立訂單、再預留庫存：庫存不夠或庫存服務掛掉時，資料庫留下一張沒有庫存的訂單
// ✗ 訂單和品項分開寫入，沒有交易：中間出錯會留下沒有品項的訂單
// ✗ 同一個 clientOrderId 重送會再建一張（沒有冪等）
// 要做到的順序：驗證 → 這個 clientOrderId 已經下過就回原本那張 → reserveFor（key 用 `${顧客 id}:${clientOrderId}`）
//   → 失敗回 OutOfStock 或 InventoryUnavailable（reason 是 TIMEOUT／DOWN）→ 成功才在交易裡建立訂單與品項
// 訂單的 client_order_id 欄位有唯一約束 (customer_id, client_order_id)：同時送兩次時用它擋下第二張
import { GraphQLError } from 'graphql'
import type { Context, OrderRow } from './context.ts'
import { unauthenticated } from './auth.ts'
import { reserveFor, type Line } from './inventory.ts'

export type PlaceOrderInput = { clientOrderId: string, lines: Line[] }
export type PlaceOrderResult =
  | { __typename: 'OrderPlaced', order: OrderRow }
  | { __typename: 'OutOfStock', productId: string, available: number }
  | { __typename: 'InvalidQuantity', productId: string, quantity: number }

export async function placeOrder(ctx: Context, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const viewer = ctx.viewer
  if (viewer?.role !== 'CUSTOMER') throw unauthenticated()
  const customerId = Number(viewer.id)

  const wanted = new Map<string, number>()
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 20) {
      return { __typename: 'InvalidQuantity', productId: l.productId, quantity: l.quantity }
    }
    wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity)
  }
  if (!wanted.size) throw new GraphQLError('至少要有一個品項', { extensions: { code: 'BAD_USER_INPUT' } })
  const products = await ctx.db.query<{ id: number, price: number }>('SELECT id, price FROM products WHERE id = ANY($1)', [[...wanted.keys()].map(Number)])
  const price = new Map(products.map(p => [String(p.id), p.price]))
  for (const id of wanted.keys()) {
    if (!price.has(id)) throw new GraphQLError(`找不到商品 ${id}`, { extensions: { code: 'BAD_USER_INPUT' } })
  }
  const lines = [...wanted].map(([productId, quantity]) => ({ productId, quantity }))
  const total = lines.reduce((sum, l) => sum + price.get(l.productId)! * l.quantity, 0)

  const [order] = await ctx.db.query<OrderRow>(
    `INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), $2)
     RETURNING id, customer_id, ordered_at, total, internal_note`,
    [customerId, total])
  for (const l of lines) {
    await ctx.db.query('INSERT INTO order_items VALUES ($1, $2, $3, $4)', [order.id, Number(l.productId), l.quantity, price.get(l.productId)])
  }
  const outcome = await reserveFor(ctx, `${customerId}:${input.clientOrderId}`, lines)
  if (!outcome.ok && 'outOfStock' in outcome) return { __typename: 'OutOfStock', ...outcome.outOfStock }
  return { __typename: 'OrderPlaced', order }
}
