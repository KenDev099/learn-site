import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { importMenu, type MenuItem } from './batch.ts'

const redis = useRedis(4)

// 包一層 Proxy，記下「學習者的程式直接呼叫了 client 的哪些方法」與 pipeline 的 exec 次數；
// ioredis 內部（例如 pipeline 送出時）呼叫的方法不算
function spy(client: Redis) {
  const calls: string[] = []
  let execs = 0
  let depth = 0
  const track = (target: object, onCall: (name: string) => void): any => new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver)
      if (typeof value !== 'function' || typeof prop !== 'string') return value
      return function (this: unknown, ...args: unknown[]) {
        if (depth === 0) onCall(prop)
        depth++
        try {
          const result = Reflect.apply(value, this, args)
          if (prop === 'pipeline' || prop === 'multi') return track(result as object, name => { if (name === 'exec') execs++ })
          return result
        } finally {
          depth--
        }
      }
    },
  })
  const proxy = track(client, name => calls.push(name)) as Redis
  return { proxy, calls, execs: () => execs }
}

const NAMES = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
const PRICES = [80, 110, 110, 90, 70, 120]
const items: MenuItem[] = Array.from({ length: 200 }, (_, i) => ({ id: 10 + i, name: `${NAMES[i % 6]} ${10 + i}`, price: PRICES[i % 6] }))

describe('練習 1：一次匯入菜單（pipeline）', { timeout: 30_000 }, () => {
  test('200 個商品用一個 pipeline、一次 exec 寫進去', async () => {
    const { proxy, calls, execs } = spy(redis)
    const failed = await importMenu(proxy, items)
    assert.deepEqual(failed, [], '全部寫入成功時要回傳 []')
    const direct = calls.filter(name => name !== 'pipeline')
    assert.deepEqual(direct, [], `直接在 redis 上呼叫了 ${[...new Set(direct)].join('、')}：每個指令都等一次來回；指令要加在 pipeline 上`)
    assert.equal(calls.filter(name => name === 'pipeline').length, 1, `呼叫了 ${calls.filter(name => name === 'pipeline').length} 次 redis.pipeline()：200 個指令放進同一個 pipeline`)
    assert.equal(execs(), 1, `exec() 呼叫了 ${execs()} 次：整批只送一次`)
    assert.deepEqual(await redis.hgetall('ds:menu:10'), { name: '美式咖啡 10', price: '80' }, 'ds:menu:10 要是 hash { name, price }')
    assert.deepEqual(await redis.hgetall('ds:menu:209'), { name: '拿鐵 209', price: '110' }, '最後一個商品 ds:menu:209 也要寫進去')
  })

  test('其中一個指令失敗時回報它的 id，其他照樣寫入', async () => {
    await redis.flushdb()
    await redis.set('ds:menu:57', 'oops')   // 先放一個 string，HSET 會得到 WRONGTYPE
    const { proxy, calls, execs } = spy(redis)
    const failed = await importMenu(proxy, items)
    assert.deepEqual(failed, [57], `回傳了 ${JSON.stringify(failed)}：exec() 回傳 [錯誤, 結果] 的陣列，第 i 個的錯誤不是 null 就是 items[i] 失敗`)
    assert.deepEqual(calls, ['pipeline'], `在 redis 上呼叫了 ${calls.join('、')}：失敗時不要重送，pipeline 不會回滾，其他 199 個指令已經寫入了`)
    assert.equal(execs(), 1, `exec() 呼叫了 ${execs()} 次：失敗時也只送一次`)
    assert.equal(await redis.get('ds:menu:57'), 'oops', '失敗的那個 key 維持原樣')
    const check = redis.pipeline()
    for (const item of items) check.hget(`ds:menu:${item.id}`, 'name')
    const names = (await check.exec()) ?? []
    const written = items.filter((item, i) => item.id !== 57 && names[i]?.[1] === item.name).length
    assert.equal(written, 199, `其他 199 個商品都要寫入，現在只有 ${written} 個`)
  })
})
