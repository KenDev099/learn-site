import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { countVisitors, loyal, markVisit } from './visitors.ts'

const redis = useRedis(2)

const visits: Record<string, number[]> = {
  '2026-11-01': [1, 2, 3, 4, 2, 1],
  '2026-11-02': [2, 3, 5, 3],
  '2026-11-03': [6, 3, 2, 4],
}

describe('練習 4：每天來過的會員（set）', { timeout: 30_000 }, () => {
  test('同一位會員一天來好幾次只算一次', async () => {
    for (const [date, ids] of Object.entries(visits)) for (const id of ids) await markVisit(redis, date, id)
    assert.equal(await countVisitors(redis, '2026-11-01'), 4, '11/01 來了 1 2 3 4 2 1，不同的會員是 4 位（用 set 存，SCARD 計數）')
    assert.equal(await countVisitors(redis, '2026-11-02'), 3, '11/02 是 2 3 5，共 3 位')
    assert.equal(await countVisitors(redis, '2026-10-31'), 0, '沒人來的那天是 0')
  })

  test('只用了 ds: 開頭的 key，而且每天一個 set', async () => {
    const keys = await redis.keys('*')   // 判分用的 DB 只有幾個 key，才能用 KEYS；正式環境不要用
    assert.ok(keys.length >= 3 && keys.every(k => k.startsWith('ds:')), `key 要以 ds: 開頭、每天一個，現在是 ${JSON.stringify(keys)}`)
    for (const k of keys) assert.equal(await redis.type(k), 'set', `${k} 要是 set`)
  })

  test('loyal 回傳每一天都有來的會員（交集），由小到大', async () => {
    assert.deepEqual(await loyal(redis, ['2026-11-01', '2026-11-02', '2026-11-03']), [2, 3], '三天都有來的是 2 和 3（SINTER，不是 SUNION）')
    assert.deepEqual(await loyal(redis, ['2026-11-03', '2026-11-01']), [2, 3, 4], '11/03 和 11/01 都有來的是 2 3 4：每一天都要算進去')
    assert.deepEqual(await loyal(redis, ['2026-11-02']), [2, 3, 5], '只給一天時就是那天的會員')
  })

  test('loyal 依數字大小排序（不是字串順序）', async () => {
    for (const id of [100, 9, 10]) await markVisit(redis, '2026-11-04', id)
    for (const id of [10, 100, 9, 7]) await markVisit(redis, '2026-11-05', id)
    assert.deepEqual(await loyal(redis, ['2026-11-04', '2026-11-05']), [9, 10, 100], 'SINTER 回傳的是字串，先轉成 number 再用 (a, b) => a - b 排序；直接 sort() 會得到 10、100、9')
  })

  test('dates 是空陣列時回傳 []', async () => {
    assert.deepEqual(await loyal(redis, []), [], 'SINTER 至少要一個 key，空陣列要自己先處理')
  })
})
