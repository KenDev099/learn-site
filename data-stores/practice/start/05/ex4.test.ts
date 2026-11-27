import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { appendEvent, trimOlderThan } from './trim.ts'

const redis = useRedis(5)

// 記下 appendEvent 送出的每個指令的參數
function recording(target: Redis) {
  const calls: unknown[][] = []
  const proxy = new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args.flat()])
        return value.apply(t, args)
      }
    },
  }) as Redis
  return { proxy, calls }
}

describe('練習 4：stream 的長度上限', { timeout: 30_000 }, () => {
  test('appendEvent 寫入欄位並回傳 id', async () => {
    const id = await appendEvent(redis, 'ds:t05:one', { type: 'paid', orderId: 12 }, 100)
    assert.match(id, /^\d+-\d+$/, `要回傳 XADD 產生的 id（毫秒-序號），收到 ${JSON.stringify(id)}`)
    const [[gotId, fields]] = await redis.xrange('ds:t05:one', '-', '+')
    assert.equal(gotId, id, '回傳的 id 要是剛寫入那筆的 id')
    assert.deepEqual(fields, ['type', 'paid', 'orderId', '12'], '欄位要照 fields 寫入')
  })

  test('寫 5,000 筆、maxLen 1000：長度維持在 1000 附近，而且用近似修剪', async () => {
    const { proxy, calls } = recording(redis)
    const stream = 'ds:t05:events'
    await Promise.all(Array.from({ length: 5000 }, (_, i) => appendEvent(proxy, stream, { type: 'paid', orderId: 10 + i }, 1000)))
    const len = await redis.xlen(stream)
    assert.ok(len >= 1000 && len <= 1100, `XLEN 是 ${len}：要在 XADD 時加上 MAXLEN ~ 1000，長度會維持在 1000～1100 之間（近似修剪一次刪掉整個節點，最多多留約 100 筆）`)
    assert.ok(calls.some(c => c.map(String).includes('~')), 'XADD 要用近似修剪（MAXLEN ~ 1000）：精確修剪（MAXLEN 1000 或 =）每次寫入都要拆開節點，比較慢')
  })

  test('trimOlderThan 用毫秒的 MINID 精確刪掉 cutoff 以前的訊息', async () => {
    const stream = 'ds:t05:old'
    const base = 1_793_000_000_000
    await Promise.all(Array.from({ length: 300 }, (_, i) => redis.xadd(stream, `${base + i * 1000}-0`, 'i', String(i))))
    const removed = await trimOlderThan(redis, stream, base + 150_500)
    const [[first]] = await redis.xrange(stream, '-', '+', 'COUNT', 1)
    assert.equal(Number(first.split('-')[0]), base + 151_000, `最舊的訊息應該是 ${base + 151_000}-0，實際是 ${first}：MINID 要用毫秒（id 的前半是毫秒時間戳），而且要精確修剪（不加 ~）`)
    assert.equal(removed, 151, `要刪掉 151 筆（時間早於 cutoff 的），回傳的是 ${removed}：回傳 XTRIM 的回覆`)
  })
})
