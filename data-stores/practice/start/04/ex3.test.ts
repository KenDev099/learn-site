import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { claim, CLAIM_LUA, type ClaimResult } from './coupon.ts'

const redis = useRedis(4)

// 記下送到 Redis 的每個指令名稱，以及 EVAL／EVALSHA 傳的 key（ioredis 的每個指令最後都經過 sendCommand）
function spy(client: Redis) {
  const sent: string[] = []
  const evalKeys: string[] = []
  const proxy = new Proxy(client, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver)
      if (prop !== 'sendCommand' || typeof value !== 'function') return value
      return function (this: unknown, command: { name: string, args: unknown[] }, ...rest: unknown[]) {
        const name = command.name.toLowerCase()
        sent.push(name)
        if (name === 'eval' || name === 'evalsha') evalKeys.push(...command.args.slice(2, 2 + Number(command.args[1])).map(String))
        return Reflect.apply(value, this, [command, ...rest])
      }
    },
  })
  return { proxy, sent, evalKeys }
}

describe('練習 3：限量優惠券（Lua）', { timeout: 30_000 }, () => {
  test('腳本裡沒有寫死 key 名稱', () => {
    assert.ok(!CLAIM_LUA.includes('ds:'), 'CLAIM_LUA 裡出現了 ds:：key 要從 KEYS[1]、KEYS[2] 傳入，Redis Cluster 才知道這個腳本會碰哪些 key')
    assert.match(CLAIM_LUA, /KEYS\[2\]/, 'CLAIM_LUA 要用 KEYS[1]（庫存）和 KEYS[2]（領過的客人）')
  })

  test('一位一位領：已領過、賣完、沒有庫存 key', async () => {
    await redis.set('ds:coupon:opening:stock', 2)
    const { proxy, sent, evalKeys } = spy(redis)
    assert.equal(await claim(proxy, 'opening', 10), 'ok', '還有 2 張，顧客 10 領到')
    assert.ok(sent.some(name => name === 'eval' || name === 'evalsha'), `送出的指令是 ${sent.join('、')}：要用 EVAL／EVALSHA 執行 CLAIM_LUA`)
    for (const key of ['ds:coupon:opening:stock', 'ds:coupon:opening:claimed']) {
      assert.ok(evalKeys.includes(key), `EVAL 傳入的 key 是 [${evalKeys.join(', ')}]：${key} 要當成 key 傳（numkeys 算進去、放進 KEYS），不要放進 ARGV 再在腳本裡拼`)
    }
    assert.equal(await claim(proxy, 'opening', 10), 'already-claimed', '顧客 10 第二次領要回 already-claimed')
    assert.equal(await redis.get('ds:coupon:opening:stock'), '1', '已領過的人再領一次，庫存不能被扣（先檢查領過沒有，再扣庫存）')
    assert.equal(await claim(proxy, 'opening', 11), 'ok', '還有 1 張，顧客 11 領到')
    assert.equal(await claim(proxy, 'opening', 12), 'sold-out', '庫存 0 時回 sold-out')
    assert.equal(await claim(proxy, 'opening', 10), 'already-claimed', '賣完之後，已經領過的顧客 10 仍然回 already-claimed')
    assert.equal(await redis.get('ds:coupon:opening:stock'), '0', '庫存不能被扣到負數')
    assert.deepEqual((await redis.smembers('ds:coupon:opening:claimed')).sort(), ['10', '11'], 'ds:coupon:opening:claimed 是領過的顧客 id 的 set')
    assert.equal(await claim(proxy, 'nostock', 13), 'sold-out', '沒有設定庫存的活動（stock key 不存在）當成 0 張')
  })

  test('300 個請求同時搶 100 張：剛好發出 100 張，沒有人領兩張', async () => {
    await redis.set('ds:coupon:grand:stock', 100)
    await redis.set('ds:coupon:other:stock', 5)
    const customers = Array.from({ length: 150 }, (_, i) => 100 + i)
    const calls = customers.flatMap(id => [id, id])   // 150 位客人，每人連按兩次
    const results: ClaimResult[] = await Promise.all(calls.map(id => claim(redis, 'grand', id)))
    const ok = results.filter(r => r === 'ok').length
    assert.equal(ok, 100, `發出了 ${ok} 張：在程式裡 GET 庫存、判斷、再 DECR，300 個請求會同時讀到 100；整段要在一個 Lua 腳本裡做完`)
    assert.equal(await redis.get('ds:coupon:grand:stock'), '0', '100 張發完，庫存剛好是 0')
    assert.equal(await redis.scard('ds:coupon:grand:claimed'), 100, '剛好 100 位客人領到')
    for (const id of customers) {
      const mine = results.filter((r, i) => calls[i] === id && r === 'ok').length
      assert.ok(mine <= 1, `顧客 ${id} 領到 ${mine} 張`)
    }
    assert.equal(await redis.get('ds:coupon:other:stock'), '5', '不同活動的庫存互不影響')
  })
})
