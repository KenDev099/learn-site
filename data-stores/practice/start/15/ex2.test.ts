import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@elastic/elasticsearch'
import { S3Client } from '@aws-sdk/client-s3'
import type { Redis } from 'ioredis'
import { usePg } from '../../helpers/pg.ts'
import { useRedis } from '../../helpers/redis.ts'
import { S3_CONFIG } from '../../helpers/s3.ts'
import { hangingServer } from './fixtures.ts'
import { cartKey, createTables, EmptyCartError, idemKey, OutOfStockError, RateLimitedError, rateKey, type Deps } from './schema.ts'
import { checkout } from './checkout.ts'

const pool = usePg(15)
const redis = useRedis(15)
const NOW = Date.parse('2026-10-15T03:00:00Z')
let deps: Deps
let down: Awaited<ReturnType<typeof hangingServer>>

async function fill(customerId: number, cart: Record<number, number>) {
  await redis.del(cartKey(customerId))
  await redis.hset(cartKey(customerId), Object.fromEntries(Object.entries(cart).map(([k, v]) => [k, String(v)])))
}
const ordersOf = async (customerId: number) => (await pool.query('SELECT id, total, idempotency_key FROM orders WHERE customer_id = $1 ORDER BY id', [customerId])).rows
const product = async (id: number) => (await pool.query('SELECT stock, sold, version FROM products WHERE id = $1', [id])).rows[0]
const outboxCount = async () => Number((await pool.query('SELECT count(*) FROM outbox')).rows[0].count)

describe('練習 2：結帳 checkout', { timeout: 60_000 }, () => {
  before(async () => {
    await createTables(pool)
    // Elasticsearch 與 S3 都指向「收下連線、永遠不回應」的伺服器：checkout 只要碰到它們就會卡住
    down = await hangingServer()
    const es = new Client({ node: down.url, maxRetries: 0, requestTimeout: 10_000 })
    const s3 = new S3Client({ ...S3_CONFIG, endpoint: down.url, maxAttempts: 1 })
    deps = { pool, redis, es, index: 't15-menu', s3, bucket: 't15-receipts' }
  })
  after(async () => { await deps.es.close(); deps.s3.destroy(); down.close() })

  test('正常下單：訂單、品項、庫存、熱銷度、outbox 都寫好，購物車清空；ES、S3 當機也不受影響', async () => {
    await fill(21, { 11: 2, 16: 1 })
    const t0 = Date.now()
    const r = await checkout(deps, { customerId: 21, idempotencyKey: 'k-21-a', now: NOW })
    const ms = Date.now() - t0
    assert.ok(ms < 4_000, `這個測試裡 Elasticsearch 與 S3 都當機（連得上但不回應），結帳卻花了 ${ms} ms：checkout 不能呼叫 Elasticsearch 或 S3，熱銷度與收據交給 outbox worker`)
    await new Promise(r => setTimeout(r, 200))   // 不 await 的呼叫（fire-and-forget）也要等它連線
    assert.equal(down.connections(), 0, 'checkout 連到了 Elasticsearch 或 S3：就算放在 COMMIT 之後、不 await，也是「雙寫」，失敗了就永遠漏掉。熱銷度與收據只寫 outbox 事件，交給 worker')
    assert.equal(typeof r.orderId, 'number', `orderId 要是 number，實際是 ${typeof r.orderId}`)
    assert.equal(r.total, 280, `美式咖啡 80 × 2 ＋ 起司蛋糕 120 = 280，實際回傳 ${r.total}：數量從 Redis 讀出來是字串，要轉成數字`)
    const orders = await ordersOf(21)
    assert.equal(orders.length, 1, 'orders 要有一筆王小明（21）的訂單')
    assert.deepEqual(orders[0], { id: r.orderId, total: 280, idempotency_key: 'k-21-a' }, 'orders 的 id、total、idempotency_key 要跟回傳值一致')
    const { rows: [{ created_at }] } = await pool.query('SELECT created_at FROM orders WHERE id = $1', [r.orderId])
    assert.equal(created_at.getTime(), NOW, 'created_at 要用參數 now（new Date(now)），不要用資料庫的 now()')
    const { rows: items } = await pool.query('SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id', [r.orderId])
    assert.deepEqual(items, [{ product_id: 11, quantity: 2, unit_price: 80 }, { product_id: 16, quantity: 1, unit_price: 120 }], 'order_items 要有兩筆，unit_price 是下單當時的價格')
    assert.deepEqual(await product(11), { stock: 48, sold: 2, version: 2 }, '美式咖啡：庫存 50 → 48、sold 0 → 2、version 1 → 2')
    const { rows: events } = await pool.query('SELECT type, aggregate_id, processed_at FROM outbox')
    assert.deepEqual(events, [{ type: 'order.paid', aggregate_id: r.orderId, processed_at: null }], 'outbox 要有一筆 order.paid 事件，aggregate_id 是訂單 id')
    assert.equal(await redis.exists(cartKey(21)), 0, '下單成功後要刪掉購物車')
    assert.deepEqual(JSON.parse((await redis.get(idemKey('k-21-a'))) ?? 'null'), r, 'Redis 要存下這個冪等鍵的結果 { orderId, total }')
    const ttl = await redis.ttl(idemKey('k-21-a'))
    assert.ok(ttl > 0 && ttl <= 86_400, `冪等結果要設 TTL（IDEM_TTL_SEC），實際 TTL ${ttl}`)
    const rl = await redis.pttl(rateKey(21, NOW))
    assert.ok(rl > 0 && rl <= 60_000, `限流的 key 要有過期時間（PEXPIRE … NX），實際 PTTL ${rl}`)
  })

  test('outbox 寫不進去時，整筆訂單回滾：沒有訂單、庫存不變、購物車還在', async () => {
    await fill(22, { 12: 1 })
    await pool.query('ALTER TABLE outbox ADD CONSTRAINT t15_block CHECK (aggregate_id < 0) NOT VALID')
    try {
      await assert.rejects(checkout(deps, { customerId: 22, idempotencyKey: 'k-22-block', now: NOW }), '寫 outbox 失敗時 checkout 要丟錯')
    } finally {
      await pool.query('ALTER TABLE outbox DROP CONSTRAINT t15_block')
    }
    assert.deepEqual(await ordersOf(22), [], '寫 outbox 失敗，訂單卻留下來了：訂單和 outbox 要在同一個交易（同一個 client 的 BEGIN … COMMIT）')
    assert.equal((await product(12)).stock, 50, '拿鐵的庫存要維持 50：失敗時整個交易 ROLLBACK')
    assert.equal(await redis.hlen(cartKey(22)), 1, '結帳失敗時不能刪購物車')
  })

  test('同一個冪等鍵重送 5 次只有一筆訂單；Redis 被清空後再送，仍然回傳原訂單', async () => {
    await fill(22, { 12: 1 })
    const first = await checkout(deps, { customerId: 22, idempotencyKey: 'k-22-a', now: NOW })
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(await checkout(deps, { customerId: 22, idempotencyKey: 'k-22-a', now: NOW }), first, '同一個冪等鍵重送要回傳同一筆訂單')
    }
    assert.equal((await ordersOf(22)).length, 1, '重送不能多建訂單')
    await redis.flushdb()   // Redis 重啟、資料沒了：購物車、冪等結果都不見
    let again
    try {
      again = await checkout(deps, { customerId: 22, idempotencyKey: 'k-22-a', now: NOW })
    } catch (e) {
      assert.fail(`Redis 清空後重送同一個鍵丟出 ${(e as Error).name}：先查 orders.idempotency_key 有沒有這筆訂單，再讀購物車`)
    }
    assert.deepEqual(again, first, 'Redis 清空後重送，要從 PostgreSQL 找到原訂單並回傳')
    assert.equal((await ordersOf(22)).length, 1, 'Redis 清空後重送也不能多建訂單')
    assert.equal((await product(12)).stock, 49, '拿鐵只扣一次庫存')
  })

  test('同一個鍵並發送 5 次（Redis 裡還沒有結果）：只有一筆訂單，5 個請求都拿到它', async () => {
    await fill(23, { 13: 1, 15: 2 })
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => checkout(deps, { customerId: 23, idempotencyKey: 'k-23-a', now: NOW })))
    const bad = results.filter(r => r.status === 'rejected')
    assert.deepEqual(bad.map(r => (r as PromiseRejectedResult).reason?.message), [], '並發的同鍵請求不能丟錯：INSERT … ON CONFLICT (idempotency_key) DO NOTHING，沒插入就回傳已存在的那筆')
    const values = results.map(r => (r as PromiseFulfilledResult<unknown>).value)
    for (const v of values) assert.deepEqual(v, values[0], '5 個請求要拿到同一筆訂單')
    assert.equal((values[0] as { total: number }).total, 250, '卡布奇諾 110 ＋ 可頌 70 × 2 = 250')
    assert.equal((await ordersOf(23)).length, 1, `建立了 ${(await ordersOf(23)).length} 筆訂單：只靠 Redis 判斷時，並發的請求都看到「沒有」`)
    assert.equal((await product(15)).stock, 18, '可頌只扣一次庫存（20 → 18）')
  })

  test('庫存不足：丟 OutOfStockError，沒有任何寫入，購物車保留', async () => {
    const before13 = (await product(13)).stock, events = await outboxCount()
    await fill(24, { 13: 2, 16: 999 })
    await assert.rejects(checkout(deps, { customerId: 24, idempotencyKey: 'k-24-a', now: NOW }), OutOfStockError, '起司蛋糕只剩 9 個，要 999 個：丟 OutOfStockError')
    assert.deepEqual(await ordersOf(24), [], '庫存不足時不能留下訂單')
    assert.equal((await product(13)).stock, before13, '卡布奇諾的庫存要維持原樣：已經扣掉的部分要跟著 ROLLBACK')
    assert.equal(await outboxCount(), events, '庫存不足時不能寫 outbox')
    assert.equal(await redis.hlen(cartKey(24)), 2, '結帳失敗時購物車要保留')
  })

  test('清購物車失敗（Redis 剛好斷線）不影響結帳結果', async () => {
    await fill(25, { 14: 1 })
    const broken = new Proxy(redis, {
      get(target, prop) {
        if (prop === 'del' || prop === 'unlink' || prop === 'hdel') return async () => { throw new Error('模擬 Redis 斷線') }
        const v = Reflect.get(target, prop, target)
        return typeof v === 'function' ? v.bind(target) : v
      },
    }) as Redis
    let r
    try {
      r = await checkout({ ...deps, redis: broken }, { customerId: 25, idempotencyKey: 'k-25-a', now: NOW })
    } catch (e) {
      assert.fail(`訂單已經提交，清購物車失敗卻讓 checkout 丟出「${(e as Error).message}」：COMMIT 之後的收尾要 try/catch，失敗只記 log`)
    }
    assert.equal(r.total, 90, '伯爵紅茶 90 元')
    assert.equal((await ordersOf(25)).length, 1, '訂單要成立')
  })

  test('限流：同一位顧客同時送 15 次，剛好 10 次通過、5 次 RateLimitedError；下一個視窗重新計算', async () => {
    const results = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => checkout(deps, { customerId: 26, idempotencyKey: `k-26-${i}`, now: NOW })))
    const reasons = results.map(r => r.status === 'rejected' ? r.reason : null)
    const limited = reasons.filter(e => e instanceof RateLimitedError).length
    const empty = reasons.filter(e => e instanceof EmptyCartError).length
    assert.equal(limited, 5, `15 次裡有 ${limited} 次被限流（要剛好 5 次）：先 GET 再 SET 不是原子的，並發的請求會讀到同一個舊值；用 INCR 的回傳值判斷`)
    assert.equal(empty, 10, `通過限流的 10 次要讀購物車，空的丟 EmptyCartError（實際 ${empty} 次）：限流要在讀購物車之前`)
    await assert.rejects(checkout(deps, { customerId: 26, idempotencyKey: 'k-26-next', now: NOW + 60_000 }), EmptyCartError, '下一個 60 秒視窗要重新計算，不能再被限流')
  })
})
