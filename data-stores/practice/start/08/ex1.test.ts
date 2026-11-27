import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Document } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { ensureIndexes } from './indexes.ts'

const { db } = useMongo(8)

// 固定 seed 的 5 萬家門市：台北 600 家，營業中、關閉、整修交錯；rating 1.00～5.00
function seedStores() {
  let s = 8
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
  const cities = ['台北', '新北', '桃園', '台中', '台南', '高雄', '新竹', '基隆', '嘉義', '宜蘭', '花蓮', '台東', '屏東', '苗栗', '彰化', '南投', '雲林', '澎湖', '金門', '連江']
  const docs = []
  for (let i = 0; i < 50_000; i++) {
    const r = rnd()
    docs.push({
      name: `門市 ${i + 10}`,
      city: i < 600 ? '台北' : cities[1 + Math.floor(rnd() * 19)],
      status: r < 0.65 ? 'open' : r < 0.95 ? 'closed' : 'renovating',
      rating: Math.round(rnd() * 400 + 100) / 100,
      reviewCount: Math.floor(rnd() * 500),
    })
  }
  return docs.sort(() => rnd() - 0.5)
}

const walk = (st: Document | undefined): Document[] => st ? [st, ...walk(st.inputStage), ...(st.inputStages ?? []).flatMap(walk)] : []

describe('練習 1：複合索引（ESR）與 TTL 索引', { timeout: 60_000 }, () => {
  test('「台北營業中、評分高到低取 20 家」走索引、不在記憶體排序、只看 20 份文件', async () => {
    const docs = seedStores()
    await db.collection('stores').insertMany(docs)
    await ensureIndexes(db)
    const stores = db.collection('stores')
    const query = () => stores.find({ status: 'open', city: '台北' }).sort({ rating: -1 }).limit(20)
    const got = await query().project({ _id: 0, rating: 1 }).toArray()
    const want = docs.filter(d => d.city === '台北' && d.status === 'open').map(d => d.rating).sort((a, b) => b - a).slice(0, 20)
    assert.deepEqual(got.map(d => d.rating), want, '索引不能改變查詢結果')
    const e = await query().explain('executionStats')
    const stages = walk(e.queryPlanner.winningPlan)
    const ix = stages.find(s => s.stage === 'IXSCAN')
    assert.ok(ix, `沒用到索引（${stages.map(s => s.stage).join(' → ')}）：要替 stores 建立索引`)
    assert.ok(!stages.some(s => s.stage === 'SORT'),
      `計畫裡有 SORT stage（用 ${ix.indexName}）：MongoDB 拿到資料後還要在記憶體排序。索引裡要有 rating，而且放在等值欄位（city、status）後面`)
    const { totalKeysExamined: keys, totalDocsExamined: docsExamined } = e.executionStats
    assert.ok(keys <= 21,
      `為了回傳 20 家看了 ${keys} 個索引項（${ix.indexName}）：等值欄位 city、status 要放在最前面，排序欄位 rating 接著（ESR）；status 放在 rating 後面時，關閉的門市也會被掃到再丟掉`)
    assert.ok(docsExamined <= 21, `看了 ${docsExamined} 份文件，應該只看要回傳的 20 份`)
  })

  test('checkins 的 checkedInAt 有 30 天（2592000 秒）的 TTL 索引', async () => {
    const list = await db.collection('checkins').listIndexes().toArray()
    const ttl = list.find(i => i.expireAfterSeconds !== undefined)
    assert.ok(ttl, 'checkins 沒有 TTL 索引：createIndex({ checkedInAt: 1 }, { expireAfterSeconds: … })')
    assert.deepEqual(ttl.key, { checkedInAt: 1 }, 'TTL 索引要建在日期欄位 checkedInAt 上（單一欄位；複合索引會忽略 expireAfterSeconds）')
    assert.equal(ttl.expireAfterSeconds, 2_592_000, `expireAfterSeconds 是 ${ttl.expireAfterSeconds}：單位是秒，30 天是 30 × 24 × 60 × 60 = 2592000`)
  })
})
