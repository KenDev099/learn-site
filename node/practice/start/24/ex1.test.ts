import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { call, startWorkers } from './test-cluster.ts'

const opts = { timeout: 60_000 }
const { url, pool: db } = await createTestDb([COFFEE_SQL, join(import.meta.dirname, 'schema.sql')])

const countOrders = async (customerId: number) =>
  (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM orders WHERE customer_id = $1', [customerId])).rows[0].n
const pick = (n: number) => 1 + Math.floor(Math.random() * n)

test('2 個 worker 同時收到同一個 key 的 20 個請求：只建立 1 筆，其他回相同結果或 409', opts, async () => {
  const app = await startWorkers(2, url)
  const customerId = pick(6), body = { customerId, productId: pick(6), quantity: pick(5) }
  const before = await countOrders(customerId)
  const key = randomUUID()
  const replies = await Promise.all(Array.from({ length: 20 }, () => call(app.url, 'POST', '/orders', body, { 'idempotency-key': key })))
  assert.equal(new Set(replies.map(r => r.pid)).size, 2, '（測試環境）20 條連線應該分散到 2 個 worker')
  const created = await countOrders(customerId) - before
  assert.equal(created, 1, `同一個 key 建立了 ${created} 筆訂單：記憶體裡的 Map 每個程序各一份；先 SELECT 再 INSERT 也擋不住同時到達的請求。用 INSERT … ON CONFLICT DO NOTHING 讓資料庫決定誰先到`)
  const ok = replies.filter(r => r.status === 201)
  const bad = replies.filter(r => r.status !== 201 && r.status !== 409)
  assert.equal(bad.length, 0, `有 ${bad.length} 個請求回 ${bad[0]?.status}：重送要回第一次的結果（201）或 409，不能出錯。${JSON.stringify(bad[0]?.body)}`)
  assert.ok(ok.length >= 1)
  for (const r of ok) assert.deepEqual(r.body, ok[0].body, '同一個 key 的 201 回應要完全相同（同一筆訂單）')
  await app.stop()
})

test('同一個 key、不同內容：422，不建立', opts, async () => {
  const app = await startWorkers(2, url)
  const customerId = pick(6), key = randomUUID()
  const first = await call(app.url, 'POST', '/orders', { customerId, productId: 2, quantity: 1 }, { 'idempotency-key': key })
  assert.equal(first.status, 201)
  const before = await countOrders(customerId)
  for (let i = 0; i < 4; i++) {
    const r = await call(app.url, 'POST', '/orders', { customerId, productId: 2, quantity: 2 + i }, { 'idempotency-key': key })
    assert.equal(r.status, 422, `key 用過了但內容不同，要回 422（withIdempotency 回傳 'mismatch'），收到 ${r.status}：要比對存下來的 fingerprint`)
  }
  assert.equal(await countOrders(customerId), before, '內容不同的重送不能建立訂單')
  await app.stop()
})

test('程序全部重啟之後，同一個 key 仍回第一次的結果', opts, async () => {
  let app = await startWorkers(2, url)
  const customerId = pick(6), key = randomUUID(), body = { customerId, productId: pick(6), quantity: pick(5) }
  const first = await call(app.url, 'POST', '/orders', body, { 'idempotency-key': key })
  assert.equal(first.status, 201)
  await app.stop()
  app = await startWorkers(2, url)
  const before = await countOrders(customerId)
  for (let i = 0; i < 4; i++) {
    const again = await call(app.url, 'POST', '/orders', body, { 'idempotency-key': key })
    assert.equal(again.status, 201, `重啟後重送要回第一次的狀態碼 201，收到 ${again.status}`)
    assert.deepEqual(again.body, first.body, '重啟後重送要回第一次的 body：key 和回應都要存在資料庫，不能只存 key')
  }
  assert.equal(await countOrders(customerId), before, '重啟後重送不能再建立訂單')
  await app.stop()
})

test('不同的 key 各自建立；沒帶 key 每次都建立', opts, async () => {
  const app = await startWorkers(2, url)
  const customerId = pick(6), before = await countOrders(customerId)
  const a = await call(app.url, 'POST', '/orders', { customerId, productId: 1, quantity: 1 }, { 'idempotency-key': randomUUID() })
  const b = await call(app.url, 'POST', '/orders', { customerId, productId: 1, quantity: 1 }, { 'idempotency-key': randomUUID() })
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)
  assert.notDeepEqual(a.body, b.body, '不同的 key 是不同的請求，要各自建立')
  await call(app.url, 'POST', '/orders', { customerId, productId: 1, quantity: 1 })
  await call(app.url, 'POST', '/orders', { customerId, productId: 1, quantity: 1 })
  assert.equal(await countOrders(customerId) - before, 4)
  await app.stop()
})
