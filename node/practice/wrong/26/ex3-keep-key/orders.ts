// 練習 3：下單。POST /orders（驗證、交易內扣庫存、Idempotency-Key 存在 PostgreSQL）
import type pg from 'pg'
import { HttpError, readJson, sendJson, type Ctx, type FieldError } from './platform/http.ts'
import { withTransaction } from './platform/db.ts'

export type NewOrder = { customerId: number, items: { productId: number, quantity: number }[] }
type Line = { productId: number, quantity: number, unitPrice: number }

const isInt = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max

// 一次列出所有欄位錯誤，客戶端改一次就好
export function validateNewOrder(data: unknown): { ok: true, value: NewOrder } | { ok: false, errors: FieldError[] } {
  const input = typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {}
  const errors: FieldError[] = []
  if (!isInt(input.customerId, 1, 2 ** 31 - 1)) errors.push({ field: 'customerId', message: 'customerId 要是正整數' })
  const items = input.items
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    errors.push({ field: 'items', message: 'items 要是 1 到 20 筆的陣列' })
  } else {
    const seen = new Set<unknown>()
    items.forEach((item: unknown, i) => {
      const it = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
      if (!isInt(it.productId, 1, 2 ** 31 - 1)) errors.push({ field: `items[${i}].productId`, message: 'productId 要是正整數' })
      else if (seen.has(it.productId)) errors.push({ field: `items[${i}].productId`, message: '同一個商品請合併成一筆' })
      seen.add(it.productId)
      if (!isInt(it.quantity, 1, 20)) errors.push({ field: `items[${i}].quantity`, message: 'quantity 要是 1 到 20 的整數' })
    })
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { customerId: input.customerId as number, items: (items as NewOrder['items']).map(({ productId, quantity }) => ({ productId, quantity })) } }
}

// 交易內：檢查顧客、扣庫存（不超賣）、建立訂單
async function placeOrder(client: pg.PoolClient, { customerId, items }: NewOrder) {
  const customer = await client.query('SELECT 1 FROM customers WHERE id = $1', [customerId])
  if (customer.rowCount === 0) {
    throw new HttpError('validation', '訂單資料有誤', { errors: [{ field: 'customerId', message: `沒有編號 ${customerId} 的顧客` }] })
  }
  // 固定順序鎖商品，避免兩張訂單互相等待形成死結（第 20 課）
  const sorted = [...items].sort((a, b) => a.productId - b.productId)
  const lines: Line[] = []
  for (const { productId, quantity } of sorted) {
    // 檢查和扣除在同一句：庫存不夠時 WHERE 不成立，一列都不改
    const r = await client.query<{ price: number }>(
      'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING price', [quantity, productId])
    if (r.rowCount === 0) {
      const exists = await client.query('SELECT 1 FROM products WHERE id = $1', [productId])
      if (exists.rowCount === 0) {
        const i = items.findIndex(it => it.productId === productId)
        throw new HttpError('validation', '訂單資料有誤', { errors: [{ field: `items[${i}].productId`, message: `沒有編號 ${productId} 的商品` }] })
      }
      throw new HttpError('out-of-stock', `商品 ${productId} 庫存不足`)
    }
    lines.push({ productId, quantity, unitPrice: r.rows[0].price })
  }
  return insertOrderRows(client, customerId, lines)
}

// 寫入 orders 與 order_items，回傳訂單
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

export async function createOrder({ req, res, pool }: Ctx) {
  const v = validateNewOrder(await readJson(req))
  if (!v.ok) throw new HttpError('validation', '訂單資料有誤', { errors: v.errors })

  const key = req.headers['idempotency-key']
  if (key === undefined) {
    const order = await withTransaction(pool, client => placeOrder(client, v.value))
    return sendJson(res, 201, order, { location: `/orders/${order.id}` })
  }
  if (typeof key !== 'string' || !/^[\w-]{1,100}$/.test(key)) {
    throw new HttpError('validation', 'Idempotency-Key 格式不對', { errors: [{ field: 'Idempotency-Key', message: '1 到 100 個英數字、- 或 _' }] })
  }

  // 1. 先佔 key（自己一句、立刻提交）：別的程序馬上看得到「處理中」
  const fingerprint = JSON.stringify(v.value)
  const claimed = await pool.query('INSERT INTO idempotency_keys (key, fingerprint) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, fingerprint])
  if (claimed.rowCount === 0) {
    const { rows } = await pool.query<{ fingerprint: string, response_status: number | null, response_body: { id: number } }>(
      'SELECT fingerprint, response_status, response_body FROM idempotency_keys WHERE key = $1', [key])
    const saved = rows[0]
    if (saved && saved.fingerprint !== fingerprint) throw new HttpError('idempotency-key-reused', '這個 Idempotency-Key 已經用在內容不同的訂單，請換一個新的 key')
    // 沒有 saved：前一個請求剛失敗、放掉了 key，也請客戶端稍後再試
    if (!saved || saved.response_status === null) throw new HttpError('request-in-progress', '同一個 Idempotency-Key 的請求還在處理中，請稍後再試')
    return sendJson(res, saved.response_status, saved.response_body, { location: `/orders/${saved.response_body.id}` })
  }

  // 2. 建立訂單和存下回應在同一個交易：要嘛兩個都成功，要嘛都沒發生
  try {
    const order = await withTransaction(pool, async client => {
      const order = await placeOrder(client, v.value)
      await client.query('UPDATE idempotency_keys SET response_status = 201, response_body = $2 WHERE key = $1', [key, order])
      return order
    })
    sendJson(res, 201, order, { location: `/orders/${order.id}` })
  } catch (err) {
    // 3. 失敗（庫存不足、資料庫錯誤）：放掉 key，客戶端可以用同一個 key 重試
    // ponytail: 程序在這之前當掉，key 會一直是「處理中」；正式環境用 created_at 設期限
    throw err
  }
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
