import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { allow } from './fixed-window.ts'

const redis = useRedis(3)
const MIN = 60_000
const T0 = 1_000 * MIN + 5_000   // 第 1000 個一分鐘視窗裡的第 5 秒（固定的假時間，跟真實時間無關）

describe('練習 1：固定視窗限流', { timeout: 30_000 }, () => {
  test('同一個視窗內前 limit 次放行，之後拒絕；remaining 不會小於 0', async () => {
    const got = []
    for (let i = 0; i < 8; i++) got.push(await allow(redis, 'login:10.0.0.12', 5, MIN, T0 + i * 1_000))
    assert.deepEqual(got.map(d => d.allowed), [true, true, true, true, true, false, false, false], '限制 5 次：第 6 次起要被拒絕（同一分鐘裡的時間不同，視窗編號要一樣：Math.floor(now / windowMs)）')
    assert.deepEqual(got.map(d => d.remaining), [4, 3, 2, 1, 0, 0, 0, 0], 'remaining 是還能打幾次，超過之後是 0，不是負數')
    for (const d of got) assert.equal(d.resetAt, 1_001 * MIN, `resetAt 要是這個視窗結束的時間 ${1_001 * MIN}（(視窗編號 + 1) × windowMs），收到 ${d.resetAt}`)
  })

  test('計數放在 ds:rl:<key>:<視窗編號>，用的是參數 now 而不是現在的時間', async () => {
    assert.equal(await redis.get('ds:rl:login:10.0.0.12:1000'), '8', 'ds:rl:login:10.0.0.12:1000 要是 8（INCR 了 8 次）；視窗編號要用參數 now 算，不能用 Date.now()')
  })

  test('每次呼叫後 key 都有過期時間（不超過 windowMs）', async () => {
    const ttl = await redis.pttl('ds:rl:login:10.0.0.12:1000')
    assert.ok(ttl > 0 && ttl <= MIN, `PTTL 要在 0～${MIN} 之間，收到 ${ttl}（-1 代表沒設過期時間，計數會永遠留在 Redis）`)
  })

  test('下一個視窗重新計數，而且不同 key 互不影響', async () => {
    const next = await allow(redis, 'login:10.0.0.12', 5, MIN, 1_001 * MIN)
    assert.deepEqual(next, { allowed: true, remaining: 4, resetAt: 1_002 * MIN }, '換到下一分鐘要重新從 1 算')
    const ttl = await redis.pttl('ds:rl:login:10.0.0.12:1001')
    assert.ok(ttl > 0, `新視窗的第一次呼叫之後，ds:rl:login:10.0.0.12:1001 就要有過期時間（PTTL 是 ${ttl}）：先 INCR 建出 key，再 PEXPIRE … NX；順序反過來，key 還不存在時 PEXPIRE 什麼都不做`)
    const other = await allow(redis, 'login:10.0.0.34', 5, MIN, T0)
    assert.equal(other.remaining, 4, '另一個 IP 有自己的計數')
  })

  test('20 個請求同時進來：剛好放行 limit 次，計數不會少算（limit、windowMs 都用參數）', async () => {
    const W = 10_000
    const now = 7_777 * W + 1_234                     // 10 秒一格的第 7777 格
    const got = await Promise.all(Array.from({ length: 20 }, () => allow(redis, 'api:tok-9', 3, W, now)))
    assert.equal(await redis.get('ds:rl:api:tok-9:7777'), '20', `ds:rl:api:tok-9:7777 要是 20：視窗編號用參數 windowMs 算（Math.floor(now / windowMs)），而且要用 INCR；先 GET 再 SET 會讓同時到的請求互相蓋掉、少算`)
    assert.equal(got.filter(d => d.allowed).length, 3, `limit 是 3，20 個同時到的請求要剛好放行 3 個，收到 ${got.filter(d => d.allowed).length} 個（上限要用參數 limit）`)
    assert.deepEqual(got.map(d => d.remaining).sort(), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2], 'remaining 要是 limit - 第幾次，最小 0')
    assert.ok(got.every(d => d.resetAt === 7_778 * W), `resetAt 要是 ${7_778 * W}（(視窗編號 + 1) × windowMs）`)
  })

  test('設定過期時間那一步失敗過，下一次呼叫仍然要補上 TTL', async () => {
    // 模擬：INCR 成功之後，程式在設定過期時間前當掉（這裡用丟錯代替）
    let broken = true
    const flaky = new Proxy(redis, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        const name = String(prop).toLowerCase()
        return (...args: unknown[]) => {
          const setsTtl = ['expire', 'pexpire', 'expireat', 'pexpireat'].includes(name)
            || (name === 'set' && args.some(a => typeof a === 'string' && /^(EX|PX|EXAT|PXAT)$/i.test(a)))
          if (setsTtl && broken) {
            broken = false
            return Promise.reject(new Error('模擬當機：過期時間沒設成功'))
          }
          return value.apply(target, args)
        }
      },
    }) as Redis
    const key = 'ds:rl:order:55:1000'
    await allow(flaky, 'order:55', 3, MIN, T0).catch(() => {})
    await allow(flaky, 'order:55', 3, MIN, T0 + 10)
    const ttl = await redis.pttl(key)
    assert.ok(ttl > 0, `${key} 的 PTTL 是 ${ttl}：只在 INCR 回傳 1 時才設過期，那一次失敗後就再也不會設了。每次都送 PEXPIRE key windowMs NX`)
  })
})
