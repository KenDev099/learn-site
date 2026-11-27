import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { addItem, CART_TTL_SECONDS, clearCart, getCart, removeItem } from './cart.ts'

const redis = useRedis(2)
const WEEK_MS = CART_TTL_SECONDS * 1000

describe('練習 1：購物車（hash）', { timeout: 30_000 }, () => {
  test('addItem 把數量累加在 hash ds:cart:<userId> 的欄位上', async () => {
    await addItem(redis, 1, 2, 1)
    await addItem(redis, 1, 2, 2)
    await addItem(redis, 1, 5, 1)
    assert.equal(await redis.type('ds:cart:1'), 'hash', 'ds:cart:1 要是 hash（用 HINCRBY），不是把整個購物車 JSON.stringify 成 string')
    assert.deepEqual(await redis.hgetall('ds:cart:1'), { 2: '3', 5: '1' }, '商品 2 加了 1＋2 個、商品 5 加了 1 個')
  })

  test('getCart 回傳的數量是 number；空購物車回傳 {}', async () => {
    assert.deepEqual(await getCart(redis, 1), { 2: 3, 5: 1 }, 'HGETALL 拿到的值是字串，要轉成 number')
    assert.deepEqual(await getCart(redis, 999), {}, '沒有購物車時回傳 {}（HGETALL 對不存在的 key 回 {}，不是 null）')
  })

  test('數量減到 0 以下時把欄位刪掉，不留數量 0 的商品', async () => {
    await addItem(redis, 1, 2, -1)
    assert.equal(await redis.hget('ds:cart:1', '2'), '2', 'qty -1 要把 3 減成 2')
    await addItem(redis, 1, 2, -2)
    assert.equal(await redis.hexists('ds:cart:1', '2'), 0, '減到 0 時要 HDEL 這個欄位，不能留下 "0"')
    await addItem(redis, 1, 5, -3)
    assert.equal(await redis.hexists('ds:cart:1', '5'), 0, '減到負數時也要 HDEL')
    await removeItem(redis, 3, 1)   // 移除不存在的東西不能出錯
  })

  test('removeItem 移除整個商品，clearCart 刪掉整個購物車', async () => {
    await addItem(redis, 4, 1, 2)
    await addItem(redis, 4, 6, 1)
    await removeItem(redis, 4, 1)
    assert.deepEqual(await redis.hgetall('ds:cart:4'), { 6: '1' }, 'removeItem(4, 1) 之後只剩商品 6')
    await clearCart(redis, 4)
    assert.equal(await redis.exists('ds:cart:4'), 0, 'clearCart 之後 ds:cart:4 不能存在')
  })

  test('每次寫入都把 TTL 重設為 7 天（不是只有第一次）', async () => {
    await addItem(redis, 7, 1, 1)
    const first = await redis.pttl('ds:cart:7')
    assert.ok(first > 0, `addItem 之後要有 TTL（PTTL 是 ${first}：-1 代表沒設過期時間）`)
    assert.ok(Math.abs(first - WEEK_MS) < 5_000, `TTL 要是 7 天（${WEEK_MS} ms），PTTL 是 ${first}`)
    await redis.pexpire('ds:cart:7', 60_000)   // 模擬過了快 7 天：只剩 1 分鐘
    await addItem(redis, 7, 2, 1)
    const again = await redis.pttl('ds:cart:7')
    assert.ok(Math.abs(again - WEEK_MS) < 5_000, `再加入商品後 TTL 要重新變回 7 天，PTTL 是 ${again}：每次寫入都要 EXPIRE，不能只在建立時設`)
    await addItem(redis, 7, 2, 2)
    await redis.pexpire('ds:cart:7', 60_000)
    await addItem(redis, 7, 2, -1)
    assert.ok(Math.abs(await redis.pttl('ds:cart:7') - WEEK_MS) < 5_000, '減少數量也是寫入，TTL 要重設為 7 天')
    await redis.pexpire('ds:cart:7', 60_000)
    await addItem(redis, 7, 2, -2)   // 商品 2 減到 0 被刪掉，購物車裡還有商品 1
    assert.equal(await redis.hexists('ds:cart:7', '2'), 0, '商品 2 減到 0 要刪掉')
    assert.ok(Math.abs(await redis.pttl('ds:cart:7') - WEEK_MS) < 5_000, '減到 0、刪掉欄位之後購物車還有別的商品，TTL 也要重設為 7 天：HDEL 之後一樣要 EXPIRE')
  })

  test('同時加入 20 種不同商品，一個都不能少', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => addItem(redis, 8, 100 + i, 1)))
    const cart = await getCart(redis, 8)
    assert.equal(Object.keys(cart).length, 20, `同時加入 20 種商品，購物車只剩 ${Object.keys(cart).length} 種：先讀整個購物車、改完再寫回去，後寫的會蓋掉先寫的；每個商品用 HINCRBY 只改自己的欄位`)
  })

  test('同時對同一個商品加 20 次，數量要是 20', async () => {
    await Promise.all(Array.from({ length: 20 }, () => addItem(redis, 9, 12, 1)))
    const qty = await redis.hget('ds:cart:9', '12')
    assert.equal(qty, '20', `同時加 20 次，商品 12 的數量是 ${qty}：先 HGET 讀出、在程式裡加、再 HSET 寫回，同時進來的請求都讀到舊值；用 HINCRBY 讓 Redis 一步做完`)
  })
})
