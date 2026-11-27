import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId, type CommandStartedEvent, type Document } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { ensureReviewIndex, listReviews, PAGE_SIZE, type Cursor, type Review } from './paginate.ts'

const { client, db } = useMongo(8, { monitorCommands: true })
const reviews = db.collection<Review>('ex4_reviews')
const T0 = Date.UTC(2026, 9, 1)
const walk = (st: Document | undefined): Document[] => st ? [st, ...walk(st.inputStage), ...(st.inputStages ?? []).flatMap(walk)] : []

// 門市 12 有 1000 則評論，每 7 則同一個時間（同一分鐘一起匯入）；門市 11、13 的評論穿插在同樣的時間裡
function seed(): Review[] {
  const list: Review[] = []
  for (let i = 0; i < 1000; i++) list.push({ _id: new ObjectId(), storeId: 12, createdAt: new Date(T0 + Math.floor(i / 7) * 60_000), text: `評論 ${i + 10}` })
  for (let i = 0; i < 300; i++) list.push({ _id: new ObjectId(), storeId: 11 + (i % 2) * 2, createdAt: new Date(T0 + i * 30_000), text: `其他門市 ${i + 10}` })
  // 打亂新增順序：_id 的大小跟時間無關
  let s = 8
  return list.map(r => { s = (s * 1103515245 + 12345) % 2147483648; return [s, r] as const }).sort((a, b) => a[0] - b[0]).map(([, r]) => r)
}

describe('練習 4：keyset 分頁', { timeout: 60_000 }, () => {
  const finds: Document[] = []
  test('走完 1000 則：每則剛好一次、依 createdAt 新到舊、同時間的依 _id 大到小', async () => {
    const list = seed()
    await reviews.insertMany(list)
    await ensureReviewIndex(reviews)
    const want = list.filter(r => r.storeId === 12)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b._id.toHexString().localeCompare(a._id.toHexString()))
      .map(r => r._id.toHexString())
    const on = (e: CommandStartedEvent) => { if (e.commandName === 'find' && e.databaseName === db.databaseName) finds.push(e.command) }
    client.on('commandStarted', on)
    const got: string[] = []
    let after: Cursor | undefined
    try {
      for (let page = 0; page < 60; page++) {
        const { items, next } = await listReviews(reviews, 12, after)
        assert.ok(items.length <= PAGE_SIZE, `一頁最多 ${PAGE_SIZE} 則，第 ${page + 1} 頁有 ${items.length} 則`)
        got.push(...items.map(r => r._id.toHexString()))
        if (!next) break
        assert.ok(next.createdAt instanceof Date && next._id instanceof ObjectId, 'next 是 { createdAt: Date, _id: ObjectId }')
        after = next
      }
    } finally { client.off('commandStarted', on) }
    assert.equal(new Set(got).size, got.length, `有評論重複出現（${got.length - new Set(got).size} 則）`)
    assert.equal(got.length, 1000, `走完所有頁只拿到 ${got.length} 則：同一時間有好幾則評論，游標只用 createdAt 的話，跨頁那一組剩下的會被跳過或重複。游標要加上 _id：時間更早，或時間相同但 _id 更小`)
    assert.deepEqual(got, want, '順序要是 createdAt 新到舊，相同時再依 _id 大到小')
  })

  test('不用 skip；中間的頁面也走索引、不在記憶體排序', async () => {
    assert.ok(finds.length > 0, 'listReviews 要用 find 查詢')
    const skipped = finds.find(c => c.skip)
    assert.ok(!skipped, `find 帶了 skip: ${skipped?.skip}：skip 要先掃過前面所有的評論，越後面的頁越慢；用上一頁最後一則的 (createdAt, _id) 當條件`)
    const cmd = finds[Math.floor(finds.length / 2)]
    const query = Object.fromEntries(['find', 'filter', 'sort', 'limit', 'projection'].filter(k => cmd[k] !== undefined).map(k => [k, cmd[k]]))
    const e = await db.command({ explain: query, verbosity: 'executionStats' })
    const stages = walk(e.queryPlanner.winningPlan)
    assert.ok(stages.some(s => s.stage === 'IXSCAN'), `第 ${Math.floor(finds.length / 2) + 1} 頁的查詢沒用到索引（${stages.map(s => s.stage).join(' → ')}）：ensureReviewIndex 要建立 storeId、createdAt、_id 的複合索引`)
    assert.ok(!stages.some(s => s.stage === 'SORT'), '計畫裡有 SORT stage：索引欄位要是 storeId 在前、createdAt、_id 接著，方向跟 sort 一致（或全部相反）')
    assert.ok(e.executionStats.totalDocsExamined <= PAGE_SIZE + 1,
      `一頁看了 ${e.executionStats.totalDocsExamined} 份文件，應該只看要回傳的 ${PAGE_SIZE + 1} 份：索引最前面要是等值欄位 storeId，不然別家門市同時間的評論也會被讀出來再丟掉`)
  })
})
