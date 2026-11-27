import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { addSales, top } from './leaderboard.ts'

const redis = useRedis(2)

// 固定 seed 的亂數：每次執行產生一樣的銷售資料
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 產生 12 個商品、每個 3～6 筆銷售；總銷量互不相同（避免同分時的順序問題）
function makeSales(seed: number) {
  const rnd = random(seed)
  const totals = new Map<number, number>()
  const sales: [number, number][] = []
  for (let productId = 1; productId <= 12; productId++) {
    let total = 0
    const times = 3 + Math.floor(rnd() * 4)
    for (let i = 0; i < times; i++) {
      const qty = 1 + Math.floor(rnd() * 20)
      sales.push([productId, qty])
      total += qty
    }
    while ([...totals.values()].includes(total)) { sales.push([productId, 1]); total += 1 }
    totals.set(productId, total)
  }
  const expected = [...totals].map(([productId, sold]) => ({ productId, sold })).sort((a, b) => b.sold - a.sold)
  return { sales, expected }
}

describe('練習 3：每週人氣排行（sorted set）', { timeout: 30_000 }, () => {
  const { sales, expected } = makeSales(45)

  test('同一個商品賣好幾次要累加；top(3) 是銷量最高的 3 個，由高到低', async () => {
    for (const [productId, qty] of sales) await addSales(redis, '2026-W45', productId, qty)
    assert.equal(await redis.type('ds:rank:2026-W45'), 'zset', 'ds:rank:2026-W45 要是 sorted set（ZINCRBY）')
    const got = await top(redis, '2026-W45', 3)
    assert.equal(got.length, 3, `top(3) 要剛好 3 筆，收到 ${got.length} 筆（ZRANGE 的結尾索引是包含的：前 3 名是 0 到 2）`)
    assert.deepEqual(got, expected.slice(0, 3), '前 3 名或銷量不對：同一商品的銷量要用 ZINCRBY 累加（ZADD 會蓋掉），而且要由高到低（REV）')
  })

  test('productId 與 sold 都是 number', async () => {
    const [first] = await top(redis, '2026-W45', 1)
    assert.equal(typeof first?.productId, 'number', 'productId 要轉成 number')
    assert.equal(typeof first?.sold, 'number', 'WITHSCORES 回傳的分數是字串，sold 要轉成 number')
  })

  test('n 比商品數多時回傳全部；n 是 0 時回傳 []', async () => {
    assert.deepEqual(await top(redis, '2026-W45', 50), expected, 'top(50) 要回傳全部 12 個，由高到低')
    assert.deepEqual(await top(redis, '2026-W99', 5), [], '沒有資料的那一週回傳 []')
    assert.deepEqual(await top(redis, '2026-W45', 0), [], 'top(0) 要回傳 []：結尾索引 n - 1 是 -1，Redis 會當成「到最後一個」而回傳整個排行，n ≤ 0 要先處理')
    assert.deepEqual(await top(redis, '2026-W45', -1), [], 'top(-1) 也要回傳 []：結尾索引 -2 會被當成「到倒數第二個」，n ≤ 0 都要先處理')
  })

  test('不同週的排行互不影響', async () => {
    await addSales(redis, '2026-W46', 99, 1000)
    assert.deepEqual(await top(redis, '2026-W46', 10), [{ productId: 99, sold: 1000 }], 'W46 只有商品 99')
    assert.deepEqual(await top(redis, '2026-W45', 1), expected.slice(0, 1), 'W46 的銷售不能算進 W45：key 要帶週次')
  })
})
