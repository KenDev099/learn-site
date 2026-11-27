import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { useRedis } from '../../helpers/redis.ts'
import { ConflictError, withIdempotency } from './idempotency.ts'

const redis = useRedis(3)
const TTL = 24 * 60 * 60 * 1000

describe('練習 4：冪等鍵', { timeout: 30_000 }, () => {
  let runs = 0
  let ttlWhileRunning = 0
  const order = { orderId: 1012, total: 190, items: [{ productId: 12, quantity: 1 }] }
  const createOrder = async () => {
    runs++
    ttlWhileRunning = await redis.pttl('ds:idem:order-abc')
    await sleep(300)
    return order
  }

  test('同時送出 10 次：只執行一次，其他 9 次得到 ConflictError', async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => withIdempotency(redis, 'order-abc', TTL, createOrder)))
    assert.equal(runs, 1, `建立訂單被執行了 ${runs} 次：先 GET 再 SET 中間有空隙，要用 SET … PX … NX 一步搶下 key`)
    const conflicts = results.filter(r => r.status === 'rejected' && r.reason instanceof ConflictError)
    assert.equal(conflicts.length, 9, `其他 9 次要丟出 ConflictError，收到 ${conflicts.length} 個`)
    assert.ok(ttlWhileRunning > 0, `執行中的 ds:idem:order-abc 也要有 TTL（PTTL 是 ${ttlWhileRunning}）：程式在執行中當掉的話，key 要能自己過期，不然這個請求永遠卡在「處理中」`)
  })

  test('完成後再送一次：直接回傳存好的結果，不再執行', async () => {
    const again = await withIdempotency(redis, 'order-abc', TTL, createOrder)
    assert.deepEqual(again, order, '要回傳第一次的結果（存的是 JSON 字串，回傳前要 JSON.parse）')
    assert.equal(runs, 1, '已經完成的請求不能再執行一次')
    const ttl = await redis.pttl('ds:idem:order-abc')
    assert.ok(ttl > 0 && ttl <= TTL, `完成後的 key 要有 TTL，PTTL 是 ${ttl}`)
  })

  test('兩台伺服器同時收到同一把 key：仍然只執行一次', async () => {
    // 用不同的網址再載入一次 idempotency.ts，等於另一台伺服器：模組裡的變數（例如記憶體裡的 Map、Set）兩邊各一份
    const serverB = await import(new URL('./idempotency.ts?server-b', import.meta.url).href) as typeof import('./idempotency.ts')
    let count = 0
    const fn = async () => { count++; await sleep(300); return { orderId: 1020 } }
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => (i % 2 ? serverB.withIdempotency : withIdempotency)(redis, 'order-two-servers', TTL, fn)))
    assert.equal(count, 1, `兩台伺服器合計執行了 ${count} 次：鎖要放在 Redis（SET … PX … NX），放在程式記憶體裡只擋得住同一台`)
    assert.equal(results.filter(r => r.status === 'rejected' && (r.reason as Error).name === 'ConflictError').length, 9, '其他 9 次要丟出 ConflictError')
  })

  test('fn 失敗時釋放 key，之後可以重試成功', async () => {
    await assert.rejects(withIdempotency(redis, 'order-xyz', TTL, async () => { throw new Error('付款閘道逾時') }), /付款閘道逾時/, 'fn 的錯誤要往外丟')
    assert.equal(await redis.exists('ds:idem:order-xyz'), 0, 'fn 失敗後要刪掉 ds:idem:order-xyz，不然這筆訂單永遠是「處理中」')
    const ok = await withIdempotency(redis, 'order-xyz', TTL, async () => ({ orderId: 1013 }))
    assert.deepEqual(ok, { orderId: 1013 }, '重試要能成功')
  })
})
