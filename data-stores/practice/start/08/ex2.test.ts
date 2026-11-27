import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useMongo } from '../../helpers/mongo.ts'
import { analyze } from './explain.ts'

const { db } = useMongo(8)
const stores = db.collection('ex2_stores')
const cities = ['台北', '台中', '高雄', '台南']
// 每一題的 explain 都是測試當場向 MongoDB 要的真實輸出

describe('練習 2：讀 explain 的輸出', { timeout: 30_000 }, () => {
  test('沒有索引：COLLSCAN', async () => {
    await stores.insertMany(Array.from({ length: 400 }, (_, i) => ({
      name: `門市 ${i + 10}`, city: cities[i % 4], status: i % 10 === 0 ? 'renovating' : i % 3 === 0 ? 'closed' : 'open', rating: (i % 41) / 10 + 1,
    })))
    const e = await stores.find({ name: '門市 42' }).explain('executionStats')
    assert.deepEqual(analyze(e), { indexes: [], examinedRatio: 400, inMemorySort: false },
      '沒有 IXSCAN 時 indexes 是 []；為了回傳 1 份看了 400 份文件，examinedRatio 是 totalDocsExamined ÷ nReturned = 400')
    const none = await stores.find({ name: '不存在的門市' }).explain('executionStats')
    assert.deepEqual(analyze(none), { indexes: [], examinedRatio: 400, inMemorySort: false },
      '一份都沒找到時 nReturned 是 0：要當成 1 來除（400 ÷ 1），不然會得到 Infinity')
  })

  test('IXSCAN 在 FETCH 底下（巢狀的 inputStage）', async () => {
    await stores.createIndex({ city: 1 })
    const e = await stores.find({ city: '台北', status: 'open' }).explain('executionStats')
    const r = analyze(e)
    assert.deepEqual(r.indexes, ['city_1'], '最外層是 FETCH，IXSCAN 在它的 inputStage 裡：要一路往下找')
    assert.equal(r.examinedRatio, 100 / e.executionStats.nReturned, '用索引找到台北的 100 份，再一份一份檢查 status：比例是 totalDocsExamined ÷ nReturned')
    assert.equal(r.inMemorySort, false)
  })

  test('排序欄位不在索引裡：SORT stage', async () => {
    const e = await stores.find({ city: '台中' }).sort({ rating: -1 }).explain('executionStats')
    assert.deepEqual(analyze(e), { indexes: ['city_1'], examinedRatio: 1, inMemorySort: true },
      '最外層就是 SORT（記憶體排序），底下才是 FETCH → IXSCAN')
  })

  test('覆蓋查詢：只看索引、一份文件都沒讀', async () => {
    await stores.createIndex({ city: 1, status: 1 })
    const e = await stores.find({ city: '高雄' }, { projection: { _id: 0, city: 1, status: 1 } }).hint({ city: 1, status: 1 }).explain('executionStats')
    assert.deepEqual(analyze(e), { indexes: ['city_1_status_1'], examinedRatio: 0, inMemorySort: false },
      `PROJECTION_COVERED → IXSCAN，totalDocsExamined 是 ${e.executionStats.totalDocsExamined}：examinedRatio 要用文件數，不是索引項數（totalKeysExamined）`)
  })

  test('$or 用兩個索引：OR stage 的 inputStages 陣列', async () => {
    await stores.dropIndex('city_1_status_1')
    await stores.createIndex({ status: 1 })
    const e = await stores.find({ $or: [{ city: '台南' }, { status: 'renovating' }] }).explain('executionStats')
    assert.deepEqual(analyze(e), { indexes: ['city_1', 'status_1'], examinedRatio: 1, inMemorySort: false },
      'OR stage 有兩個子計畫，放在 inputStages（陣列）裡，每一個都要走訪；名稱不重複、依名稱排序')
  })

  test('有 $group 的 aggregate：slot-based 引擎的計畫在 winningPlan.queryPlan', async () => {
    const e = await stores.aggregate([{ $match: { city: '台北' } }, { $group: { _id: '$status', avg: { $avg: '$rating' } } }]).explain('executionStats')
    assert.equal(e.explainVersion, '2', '這個 aggregate 由 slot-based 引擎執行（explainVersion "2"）')
    assert.deepEqual(analyze(e), { indexes: ['city_1'], examinedRatio: 100 / 3, inMemorySort: false },
      'slot-based 引擎的 winningPlan 底下沒有 stage，stage 樹在 winningPlan.queryPlan；這裡用 city_1 找到台北 100 份，分成 3 組（open、closed、renovating）')
  })
})
