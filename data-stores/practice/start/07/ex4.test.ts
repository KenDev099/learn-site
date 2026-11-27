import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ObjectId } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { addReview, latestReviews } from './reviews.ts'

const { db } = useMongo(7)
const storeId = new ObjectId()
const otherId = new ObjectId()
const base = Date.parse('2026-11-01T00:00:00Z')
const size = async () => (await db.collection('stores').aggregate([{ $match: { _id: storeId } }, { $project: { size: { $bsonSize: '$$ROOT' } } }]).toArray())[0]?.size

describe('練習 4：評論放在獨立集合', { timeout: 60_000 }, () => {
  test('寫入 300 則評論後，門市文件的大小不變', async () => {
    await db.collection('stores').insertOne({ _id: storeId, name: '信義門市', status: 'open' })
    const before = await size()
    // 時間刻意打亂寫入順序：最新的不一定最後寫入
    const order = Array.from({ length: 300 }, (_, i) => (i * 137) % 300)
    await Promise.all(order.map(i => addReview(db, storeId, { customerId: 10 + (i % 6), rating: 1 + (i % 5), text: `評論 ${i}` }, new Date(base + i * 60_000))))
    assert.equal(await size(), before, '門市文件變大了：評論會一直增加，$push 進門市文件會讓它無限成長（上限 16 MB），要放在獨立的 reviews 集合')
    assert.equal(await db.collection('reviews').countDocuments({ storeId }), 300, 'reviews 集合要有 300 則，每則用 storeId 參照門市')
    const one = await db.collection('reviews').findOne({ storeId, text: '評論 7' })
    assert.ok(one?.createdAt instanceof Date && one.createdAt.getTime() === base + 7 * 60_000, 'createdAt 要是參數 now（Date）')
    assert.equal(one.customerId, 11, 'customerId 要照原樣存成 number')
  })

  test('latestReviews 依時間由新到舊，只回傳 limit 則，不混到別家門市', async () => {
    await addReview(db, otherId, { customerId: 10, rating: 5, text: '台中的評論' }, new Date(base + 999 * 60_000))
    const latest = await latestReviews(db, storeId, 5)
    assert.deepEqual(latest.map(r => r.text), ['評論 299', '評論 298', '評論 297', '評論 296', '評論 295'], '要用 sort({ createdAt: -1 }) 由新到舊，再 limit(5)；也要用 storeId 篩選')
    assert.equal((await latestReviews(db, storeId, 12)).length, 12, 'limit 是參數，不能寫死')
  })

  test('檔案開頭的註解說明為什麼不內嵌', () => {
    const src = readFileSync(new URL('./reviews.ts', import.meta.url), 'utf8')
    assert.match(src, /無限成長|16\s*MB/i, 'reviews.ts 開頭的註解要寫下不內嵌的原因（提到「無限成長」或「16 MB」）')
  })
})
