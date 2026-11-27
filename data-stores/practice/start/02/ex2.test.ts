import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { getRecent, recordView } from './recent.ts'

const redis = useRedis(2)

describe('練習 2：最近瀏覽（list）', { timeout: 30_000 }, () => {
  test('最新的在前、不重複、最多 5 個，而且 list 從來不超過 5 個', async () => {
    const views = [1, 2, 3, 2, 4, 5, 6, 1]
    for (const id of views) {
      await recordView(redis, 10, id)
      const len = await redis.llen('ds:recent:10')
      assert.ok(len <= 5, `瀏覽 ${id} 之後 ds:recent:10 有 ${len} 個：每次都要用 LTRIM 把 list 剪到 5 個`)
    }
    assert.equal(await redis.type('ds:recent:10'), 'list', 'ds:recent:10 要是 list')
    assert.deepEqual(await getRecent(redis, 10), [1, 6, 5, 4, 2], '依序瀏覽 1 2 3 2 4 5 6 1，最近 5 個不重複的是 [1, 6, 5, 4, 2]')
  })

  test('重複瀏覽同一個商品，它移到最前面，只出現一次', async () => {
    await recordView(redis, 11, 3)
    await recordView(redis, 11, 4)
    await recordView(redis, 11, 3)
    await recordView(redis, 11, 3)
    assert.deepEqual(await redis.lrange('ds:recent:11', 0, -1), ['3', '4'], 'LPUSH 之前先用 LREM 把舊的那一個拿掉')
  })

  test('getRecent 回傳 number 陣列；沒看過任何商品時回傳 []', async () => {
    await recordView(redis, 12, 6)
    const got = await getRecent(redis, 12)
    assert.deepEqual(got, [6], 'LRANGE 拿到的是字串陣列，要轉成 number')
    assert.deepEqual(await getRecent(redis, 13), [], '沒有瀏覽紀錄時回傳 []')
  })
})
