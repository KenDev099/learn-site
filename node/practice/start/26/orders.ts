// 練習 3：下單。POST /orders（驗證、交易內扣庫存、Idempotency-Key 存在 PostgreSQL）
// body：{ "customerId": 1, "items": [{ "productId": 2, "quantity": 1 }] }
import type pg from 'pg'
import { HttpError, readJson, sendJson, type Ctx, type FieldError } from './platform/http.ts'
import { withTransaction } from './platform/db.ts'

export type NewOrder = { customerId: number, items: { productId: number, quantity: number }[] }
type Line = { productId: number, quantity: number, unitPrice: number }

// TODO：驗證 body，一次列出所有欄位錯誤（field 用 customerId、items、items[i].productId、items[i].quantity）
//   customerId：正整數；items：1–20 筆；productId：正整數、不重複；quantity：1–20 的整數（型別要是 number，字串 "2" 不算）
export function validateNewOrder(data: unknown): { ok: true, value: NewOrder } | { ok: false, errors: FieldError[] } {
  return { ok: true, value: data as NewOrder }
}

// 寫入 orders 與 order_items，回傳訂單（不用改，直接用）
async function insertOrderRows(client: pg.PoolClient, customerId: number, lines: Line[]) {
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const { rows } = await client.query<{ id: number, status: string, ordered_at: Date }>(
    'INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), $2) RETURNING id, status, ordered_at', [customerId, total])
  const { id, status, ordered_at } = rows[0]
  for (const l of lines) {
    await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
      [id, l.productId, l.quantity, l.unitPrice])
  }
  return { id, customerId, status, total, orderedAt: ordered_at.toISOString(), items: lines }
}

// TODO：POST /orders
//   1. 驗證失敗：HttpError('validation', …, { errors })
//   2. 在交易裡（withTransaction）：顧客不存在回 400；扣庫存不能超賣，不足丟 HttpError('out-of-stock', …)；
//      用 insertOrderRows 寫入訂單；成功回 201＋Location: /orders/:id
//   3. 有 Idempotency-Key 標頭時，key 存在 idempotency_keys 表（schema.sql）：
//      同 key 同內容回第一次的結果、不同內容 422、第一個請求還在處理中 409；失敗時放掉 key
export async function createOrder({ req }: Ctx) {
  const v = validateNewOrder(await readJson(req))
  throw new Error(`練習 3：還沒寫（收到 ${JSON.stringify(v)}）`)
}

// GET /orders/:id（不用改）
export async function getOrder({ res, params, pool }: Ctx) {
  const id = Number(params[0])
  const { rows } = await pool.query<{ id: number, customer_id: number, status: string, total: number, ordered_at: Date }>(
    'SELECT id, customer_id, status, total, ordered_at FROM orders WHERE id = $1', [id])
  if (!rows[0]) throw new HttpError('not-found', `沒有編號 ${id} 的訂單`)
  const items = await pool.query<Line>(
    'SELECT product_id AS "productId", quantity, unit_price AS "unitPrice" FROM order_items WHERE order_id = $1 ORDER BY product_id', [id])
  const o = rows[0]
  sendJson(res, 200, { id: o.id, customerId: o.customer_id, status: o.status, total: o.total, orderedAt: o.ordered_at.toISOString(), items: items.rows })
}
