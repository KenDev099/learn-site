// 練習 3：下單。順序：驗證 → 同一個 clientOrderId 已經下過就回原本那張 → Reserve（冪等 key）→ 交易裡建立訂單
// 預期中的結果（庫存不夠、庫存服務逾時或掛掉、數量不對）都是回傳值，不是丟錯（第 3 課的 union）
import { GraphQLError } from 'graphql'
import type { Context, OrderRow } from './context.ts'
import { unauthenticated } from './auth.ts'
import { reserveFor, type Line } from './inventory.ts'

export type PlaceOrderInput = { clientOrderId: string, lines: Line[] }
export type PlaceOrderResult =
  | { __typename: 'OrderPlaced', order: OrderRow }
  | { __typename: 'OutOfStock', productId: string, available: number }
  | { __typename: 'InvalidQuantity', productId: string, quantity: number }
  | { __typename: 'InventoryUnavailable', reason: 'TIMEOUT' | 'DOWN' }

const COLUMNS = 'id, customer_id, ordered_at, total, internal_note'

export async function placeOrder(ctx: Context, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const viewer = ctx.viewer
  if (viewer?.role !== 'CUSTOMER') throw unauthenticated()
  const customerId = Number(viewer.id)

  // 1. 驗證：數量、商品存在。同一個商品出現好幾行時合併
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

  // 2. 重送：這個 clientOrderId 已經建立過訂單，直接回同一張（不再扣庫存）
  const existing = await findOrder(ctx, customerId, input.clientOrderId)
  if (existing) return { __typename: 'OrderPlaced', order: existing }

  // 3. 先預留庫存。key 包含顧客 id：不同顧客剛好用了同一個 clientOrderId 也不會互相影響
  const lines = [...wanted].map(([productId, quantity]) => ({ productId, quantity }))
  const outcome = await reserveFor(ctx, input.clientOrderId, lines)   // ✗ key 沒有顧客 id：兩位顧客的 clientOrderId 撞在一起
  if (!outcome.ok) {
    if ('outOfStock' in outcome) return { __typename: 'OutOfStock', ...outcome.outOfStock }
    return { __typename: 'InventoryUnavailable', reason: outcome.failure }
  }

  // 4. 預留成功才建立訂單；訂單和品項在同一個交易裡，不會留下半張訂單
  //    同一個 clientOrderId 同時送兩次：唯一約束讓第二次 DO NOTHING，再查出第一次建立的那張
  const total = lines.reduce((sum, l) => sum + price.get(l.productId)! * l.quantity, 0)
  const order = await ctx.db.transaction(async tx => {
    const [created] = await tx.query<OrderRow>(
      `INSERT INTO orders (customer_id, ordered_at, total, client_order_id) VALUES ($1, now(), $2, $3)
       ON CONFLICT (customer_id, client_order_id) DO NOTHING RETURNING ${COLUMNS}`,
      [customerId, total, input.clientOrderId])
    if (!created) return null
    await tx.query('INSERT INTO order_items SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($4::int[])',
      [created.id, lines.map(l => Number(l.productId)), lines.map(l => l.quantity), lines.map(l => price.get(l.productId))])
    return created
  })
  return { __typename: 'OrderPlaced', order: order ?? (await findOrder(ctx, customerId, input.clientOrderId))! }
}

async function findOrder(ctx: Context, customerId: number, clientOrderId: string) {
  const [row] = await ctx.db.query<OrderRow>(`SELECT ${COLUMNS} FROM orders WHERE customer_id = $1 AND client_order_id = $2`, [customerId, clientOrderId])
  return row ?? null
}
