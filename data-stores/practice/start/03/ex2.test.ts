import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { flushViews, incrView, type Row } from './views.ts'

const redis = useRedis(3)

// 假的資料庫寫入：把每一批收到的列記下來
function fakeSink() {
  const batches: Row[][] = []
  const sink = async (rows: Row[]) => { batches.push(rows) }
  const total = () => batches.flat().reduce((sum, r) => sum + r.views, 0)
  return { batches, sink, total }
}

describe('練習 2：瀏覽數計數器與批次落地', { timeout: 30_000 }, () => {
  test('incrView 累加在 hash ds:views', async () => {
    await Promise.all(Array.from({ length: 1_000 }, (_, i) => incrView(redis, 10 + (i % 4))))
    assert.equal(await redis.type('ds:views'), 'hash', 'ds:views 要是 hash（HINCRBY）')
    assert.deepEqual(await redis.hgetall('ds:views'), { 10: '250', 11: '250', 12: '250', 13: '250' }, '1,000 次分給商品 10～13，各 250 次')
  })

  test('flushViews 把計數交給 sink（數字是 number），完成後 ds:views 不再存在', async () => {
    const { batches, sink, total } = fakeSink()
    await flushViews(redis, sink)
    assert.equal(total(), 1_000, `sink 收到的總瀏覽數要是 1,000，收到 ${total()}`)
    const rows = batches.flat().sort((a, b) => a.productId - b.productId)
    assert.deepEqual(rows, [10, 11, 12, 13].map(productId => ({ productId, views: 250 })), 'productId 與 views 都要是 number（HGETALL 拿到的是字串）')
    assert.equal(await redis.exists('ds:views'), 0, '送出後 ds:views 不能還在，否則下一次會重送')
    assert.equal(await redis.exists('ds:views:flushing'), 0, 'sink 成功後要刪掉暫存 key')
  })

  test('沒有計數時不呼叫 sink，也不能出錯', async () => {
    const { batches, sink } = fakeSink()
    await flushViews(redis, sink)
    assert.equal(batches.length, 0, '沒有任何瀏覽時不要呼叫 sink（RENAME 一個不存在的 key 會丟 ERR no such key，要處理掉）')
  })

  test('讀取計數之後、刪除之前進來的瀏覽，不能消失', async () => {
    await Promise.all(Array.from({ length: 20 }, () => incrView(redis, 21)))
    let injected = false
    // 在 flushViews 讀完計數（HGETALL 回來）的那一刻，另外 50 個請求剛好進來
    const racy = new Proxy(redis, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return async (...args: unknown[]) => {
          const result = await value.apply(target, args)
          if (String(prop).toLowerCase() === 'hgetall' && !injected) {
            injected = true
            await Promise.all(Array.from({ length: 50 }, () => incrView(redis, 22)))
          }
          return result
        }
      },
    }) as Redis
    const first = fakeSink()
    await flushViews(racy, first.sink)
    const second = fakeSink()
    await flushViews(redis, second.sink)
    assert.equal(first.total() + second.total(), 70, `兩次 flush 合計要是 20＋50＝70，收到 ${first.total() + second.total()}：HGETALL 之後 DEL ds:views 會把中間進來的 50 次一起刪掉；先 RENAME 把舊的計數原子地搬走`)
  })

  test('sink 失敗時計數不能遺失，下一次 flush 一起送出', async () => {
    await Promise.all(Array.from({ length: 30 }, () => incrView(redis, 31)))
    await assert.rejects(flushViews(redis, async () => { throw new Error('資料庫暫時連不上') }), 'sink 丟出的錯誤要往外傳，呼叫的人才知道這次沒成功')
    await Promise.all(Array.from({ length: 12 }, () => incrView(redis, 32)))
    const { batches, sink, total } = fakeSink()
    await flushViews(redis, sink)
    const by = Object.fromEntries(batches.flat().map(r => [r.productId, r.views]))
    assert.equal(by[31], 30, '上一次沒送成功的 30 次（商品 31）要在這一次送出：sink 失敗時不能刪掉暫存 key，下一次要先處理它')
    assert.equal(by[32], 12, '失敗之後新進來的 12 次（商品 32）也要送出')
    assert.equal(total(), 42)
    assert.equal(await redis.exists('ds:views:flushing'), 0, '都送成功後暫存 key 要刪掉')
  })
})
