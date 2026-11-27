import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { take, TAKE_LUA } from './token-bucket.ts'

const redis = useRedis(4)
const T0 = 1_000_000   // 測試自己的時間（毫秒），跟真實時間無關

describe('練習 4：token bucket 限流（Lua）', { timeout: 30_000 }, () => {
  test('容量 5：一開始可以連續放行 5 次，第 6 次拒絕', async () => {
    const key = 'ds:bucket:login:10'
    for (let i = 1; i <= 5; i++) {
      assert.deepEqual(await take(redis, key, 5, 2, T0), { allowed: true, tokens: 5 - i }, `第 ${i} 次：桶子一開始是滿的（5 個），拿走一個後剩 ${5 - i} 個`)
    }
    assert.deepEqual(await take(redis, key, 5, 2, T0), { allowed: false, tokens: 0 }, '同一時間第 6 次：沒有代幣了，要拒絕')
    assert.equal(await redis.type(key), 'hash', '桶子存在 hash 裡')
    assert.equal(await redis.hget(key, 'ts'), String(T0), `hash 的 ts 欄位要是傳入的 now（${T0}）：時間從參數來，不要在腳本裡呼叫 TIME`)
    assert.doesNotMatch(TAKE_LUA, /TIME/, 'TAKE_LUA 裡不要呼叫 TIME，時間用 ARGV 傳入的 now')
  })

  test('依經過的時間補代幣', async () => {
    const key = 'ds:bucket:login:11'
    for (let i = 0; i < 5; i++) await take(redis, key, 5, 4, T0)
    assert.deepEqual(await take(redis, key, 5, 4, T0 + 500), { allowed: true, tokens: 1 }, '每秒補 4 個，過 0.5 秒補 2 個；拿走 1 個剩 1 個')
    assert.deepEqual(await take(redis, key, 5, 4, T0 + 625), { allowed: true, tokens: 0.5 }, '再過 0.125 秒補 0.5 個：1.5 個，拿走 1 個剩 0.5 個（代幣可以有小數，回傳時不要變成整數）')
    assert.deepEqual(await take(redis, key, 5, 4, T0 + 650), { allowed: false, tokens: 0.6 }, '再過 0.025 秒補 0.1 個：0.6 個不到 1 個，拒絕')
    assert.deepEqual(await take(redis, key, 5, 4, T0 + 600), { allowed: false, tokens: 0.6 }, '時間倒退（多台伺服器的時鐘差一點）時不補也不扣')
  })

  test('補充有上限：放很久也最多 capacity 個', async () => {
    const key = 'ds:bucket:login:12'
    await take(redis, key, 5, 2, T0)
    assert.deepEqual(await take(redis, key, 5, 2, T0 + 3_600_000), { allowed: true, tokens: 4 }, '過了一小時也只補到 5 個（capacity），拿走 1 個剩 4 個')
  })

  test('設 TTL：桶子從空補到滿的時間', async () => {
    const key = 'ds:bucket:login:13'
    await take(redis, key, 10, 4, T0)
    const pttl = await redis.pttl(key)
    assert.ok(pttl > 0, `PTTL 是 ${pttl}：沒有 TTL 的桶子永遠留在記憶體裡`)
    assert.ok(pttl <= 2500 && pttl > 1500, `容量 10、每秒補 4 個，補滿要 2500 ms，PTTL 是 ${pttl}`)
    await take(redis, key, 3, 2, T0)
    const again = await redis.pttl(key)
    assert.ok(again <= 1500 && again > 500, `容量 3、每秒補 2 個要 1500 ms（無條件進位），PTTL 是 ${again}`)
  })

  test('50 個請求同時到：放行的次數剛好等於代幣數', async () => {
    const key = 'ds:bucket:login:14'
    const results = await Promise.all(Array.from({ length: 50 }, () => take(redis, key, 10, 1, T0)))
    const allowed = results.filter(r => r.allowed).length
    assert.equal(allowed, 10, `容量 10，同時 50 個請求放行了 ${allowed} 個：在程式裡讀出、計算、再寫回，大家會讀到同一個值；整段要在 Lua 裡做完`)
    assert.equal(Number(await redis.hget(key, 'tokens')), 0, '10 個代幣用完，hash 裡的 tokens 是 0')
  })
})
