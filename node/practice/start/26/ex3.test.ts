import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { startServer } from '../../helpers/proc.ts'
import { MAIN, assertProblem, call, mainEnv, opts, postJson, setupDb, waitFor } from './testkit.ts'

const db = await setupDb()
// 兩個程序、同一個資料庫：像部署了兩台機器（第 24 課）
const a = await startServer(MAIN, { env: mainEnv(db.url) })
const b = await startServer(MAIN, { env: mainEnv(db.url) })
const stock = async (id: number) => (await db.pool.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock
const countOrdersWith = async (productId: number) =>
  Number((await db.pool.query('SELECT count(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = $1 AND o.ordered_at > now() - interval \'1 hour\'', [productId])).rows[0].count)

test('驗證失敗：400 problem+json，一次列出所有欄位錯誤', opts, async () => {
  const r = await postJson(a.url + '/orders', { customerId: 'x', items: [{ productId: 1, quantity: 0 }, { productId: -1, quantity: 2 }] })
  assertProblem(r, 400, 'validation', 'customerId、items[0].quantity、items[1].productId 都錯')
  assert.ok(Array.isArray(r.json.errors), 'problem 要有 errors 陣列：[{ field, message }]')
  const fields = r.json.errors.map((e: { field: string }) => e.field).sort()
  assert.deepEqual(fields, ['customerId', 'items[0].quantity', 'items[1].productId'], `要一次列出全部錯誤，field 用 customerId、items[i].productId、items[i].quantity 的寫法；實際 ${JSON.stringify(fields)}`)
  const empty = await postJson(a.url + '/orders', { customerId: 1, items: [] })
  assertProblem(empty, 400, 'validation', 'items 是空陣列')
  assert.deepEqual(empty.json.errors.map((e: { field: string }) => e.field), ['items'], 'items 是空陣列時 field 是 items')
  const more = await postJson(a.url + '/orders', { customerId: 1, items: [{ productId: 1, quantity: 21 }, { productId: 1, quantity: '2' }] })
  assertProblem(more, 400, 'validation', 'quantity 超過 20、同一個商品出現兩次、quantity 是字串')
  const moreFields = (more.json.errors ?? []).map((e: { field: string }) => e.field).sort()
  assert.deepEqual(moreFields, ['items[0].quantity', 'items[1].productId', 'items[1].quantity'],
    `quantity 要是 1–20 的整數（字串 "2" 也不行，不要用 Number() 轉型）、productId 不能重複；實際 ${JSON.stringify(moreFields)}`)
  const noCustomer = await postJson(a.url + '/orders', { customerId: 99_999, items: [{ productId: 1, quantity: 1 }] })
  assertProblem(noCustomer, 400, 'validation', '顧客不存在')
})

test('成功：201＋Location，金額由伺服器計算，庫存扣掉', opts, async () => {
  const before = [await stock(1), await stock(2)]
  const r = await postJson(b.url + '/orders', { customerId: 3, items: [{ productId: 2, quantity: 2 }, { productId: 1, quantity: 1 }], total: 1 })
  assert.equal(r.status, 201, `下單成功要回 201，實際 ${r.status}：${r.text.slice(0, 300)}`)
  assert.equal(r.headers.get('location'), `/orders/${r.json?.id}`, 'Location 要指向新訂單 /orders/:id')
  assert.equal(r.json.total, 110 * 2 + 80, '總金額要用資料庫裡的價格計算（拿鐵 110×2 ＋ 美式 80），不能相信客戶端送的 total')
  assert.equal(r.json.status, 'pending', '新訂單的狀態是 pending')
  assert.deepEqual([await stock(1), await stock(2)], [before[0] - 1, before[1] - 2], '庫存要扣掉')
  const got = await call(a.url + r.headers.get('location')!)
  assert.equal(got.status, 200, '另一個程序也查得到這張訂單')
})

test('庫存不足回 409 out-of-stock，兩個程序同時搶也不超賣', opts, async () => {
  await db.pool.query('UPDATE products SET stock = 5 WHERE id = 4')
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    postJson((i % 2 ? a : b).url + '/orders', { customerId: 1 + (i % 6), items: [{ productId: 4, quantity: 1 }] })))
  const statuses = results.map(r => r.status).sort()
  assert.equal(statuses.filter(s => s === 201).length, 5, `庫存 5、12 個人搶，要剛好 5 個 201，實際 ${JSON.stringify(statuses)}：檢查和扣庫存要在同一句 UPDATE … WHERE stock >= $1，或先鎖住那一列`)
  for (const r of results.filter(r => r.status !== 201)) assertProblem(r, 409, 'out-of-stock', '庫存不足')
  assert.equal(await stock(4), 0, '最後庫存要是 0')
  assert.equal(await countOrdersWith(4), 5, '資料庫裡只能有 5 張含伯爵紅茶的訂單')
})

test('Idempotency-Key：兩個程序共用，同一個 key 只建立一張訂單；內容不同回 422', opts, async () => {
  const key = randomUUID()
  const body = { customerId: 2, items: [{ productId: 5, quantity: 1 }] }
  const before = await countOrdersWith(5)
  const first = await postJson(a.url + '/orders', body, { 'idempotency-key': key })
  assert.equal(first.status, 201, `第一次要回 201，實際 ${first.status}：${first.text.slice(0, 200)}`)
  const again = await postJson(b.url + '/orders', body, { 'idempotency-key': key })
  assert.equal(again.status, 201, `同一個 key、同樣內容送到另一個程序，要回第一次的結果（201），實際 ${again.status}`)
  assert.equal(again.json?.id, first.json.id, '重送要拿到同一張訂單：key 要存在 PostgreSQL，另一個程序才看得到（記憶體裡的 Map 每個程序各一份）')
  assert.equal(await countOrdersWith(5), before + 1, '同一個 key 只能建立一張訂單')
  const other = await postJson(b.url + '/orders', { ...body, items: [{ productId: 5, quantity: 2 }] }, { 'idempotency-key': key })
  assertProblem(other, 422, 'idempotency-key-reused', '同一個 key 配不同內容')
})

test('Idempotency-Key：失敗時放掉 key，同一個 key 可以重試', opts, async () => {
  const key = randomUUID()
  const body = { customerId: 5, items: [{ productId: 3, quantity: 1 }] }
  await db.pool.query('UPDATE products SET stock = 0 WHERE id = 3')
  assertProblem(await postJson(a.url + '/orders', body, { 'idempotency-key': key }), 409, 'out-of-stock', '庫存 0 時帶 key 下單')
  await db.pool.query('UPDATE products SET stock = 10 WHERE id = 3')
  const retry = await postJson(b.url + '/orders', body, { 'idempotency-key': key })
  assert.equal(retry.status, 201, `第一次因為庫存不足失敗，補貨後用同一個 key 重試要成功（201），實際 ${retry.status}：失敗時要刪掉 idempotency_keys 裡的 key，不然它永遠停在「處理中」`)
})

test('Idempotency-Key：還在處理中回 409，完成後重送拿到同一張訂單', opts, async () => {
  const key = randomUUID()
  const body = { customerId: 4, items: [{ productId: 6, quantity: 1 }] }
  // 測試先鎖住起司蛋糕那一列，讓 a 的交易卡在扣庫存
  const lock = await db.pool.connect()
  await lock.query('BEGIN')
  await lock.query('SELECT 1 FROM products WHERE id = 6 FOR UPDATE')
  const first = postJson(a.url + '/orders', body, { 'idempotency-key': key })
  try {
    const claimed = await waitFor(async () => (await db.pool.query('SELECT 1 FROM idempotency_keys WHERE key = $1', [key])).rowCount === 1, 2000)
    assert.ok(claimed, '第一個請求要先在 idempotency_keys 寫入這個 key（立刻提交），再開始建立訂單')
    const second = await postJson(b.url + '/orders', body, { 'idempotency-key': key })
    assertProblem(second, 409, 'request-in-progress', '同一個 key 的第一個請求還在處理中，另一個程序收到重送')
  } finally {
    await lock.query('COMMIT')
    lock.release()
  }
  const r1 = await first
  assert.equal(r1.status, 201, `鎖放開後第一個請求要完成（201），實際 ${r1.status}`)
  const r2 = await postJson(b.url + '/orders', body, { 'idempotency-key': key })
  assert.equal(r2.json?.id, r1.json.id, '完成後重送要拿到同一張訂單')
  assert.equal(await countOrdersWith(6), 1, '只能建立一張訂單')
})
