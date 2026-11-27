import '../../helpers/offline.ts'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { toSql, type VectorDb } from '../../helpers/pg.ts'
import { openChunksDb, randomVectors, insertRows, cosineSim, type Row } from './fixtures.ts'
import { search, type Db } from './ex3.ts'

// 練習 3 用練習 1 的 ex1.sql 建表，所以先做完練習 1
const T = { timeout: 120_000 }
const DOCS = ['menu', 'hours', 'membership']
const vectors = randomVectors(30, 9)
const ROWS: Row[] = vectors.map((embedding, i) => ({ docId: DOCS[i % 3], seq: Math.floor(i / 3), content: `第 ${i} 塊`, embedding }))
// 查詢向量：靠近第 4、第 17 塊，再加一點雜訊（長度跟每一塊都不一樣）
const noise = randomVectors(1, 77)[0]
const QUERY = vectors[4].map((x, i) => x * 1.5 + vectors[17][i] * 1.2 + noise[i] * 0.6)

let db: VectorDb
before(async () => { db = await openChunksDb(); await insertRows(db, ROWS) }, T)
after(async () => { await db?.close() })

// 包一層：記錄你送出的每一句 SQL
function recording() {
  const sqls: string[] = []
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const wrapped: Db = { query: ((sql: string, params?: unknown[]) => { sqls.push(sql); calls.push({ sql, params }); return db.query(sql, params) }) as Db['query'] }
  return { wrapped, sqls, calls }
}
// 正確答案：在 JavaScript 裡算全部的 cosine 相似度再排序（只有測試這樣做）
const expected = (filter: (r: Row) => boolean = () => true) =>
  ROWS.filter(filter).map(r => ({ docId: r.docId, seq: r.seq, score: cosineSim(QUERY, r.embedding) })).sort((a, b) => b.score - a.score)

const near = (actual: number, want: number, msg: string) => assert.ok(Math.abs(actual - want) < 1e-5, `${msg}：預期 ${want.toFixed(6)}，拿到 ${actual}`)

test('前 3 名與分數：score = 1 - cosine 距離，由高到低', T, async () => {
  const { wrapped, sqls } = recording()
  const hits = await search(wrapped, QUERY, { k: 3 })
  const want = expected().slice(0, 3)
  assert.equal(hits.length, 3, 'k = 3 要回傳 3 筆')
  assert.deepEqual(hits.map(h => [h.docId, h.seq]), want.map(w => [w.docId, w.seq]), '前 3 名不對：ORDER BY embedding <=> $1 由小到大（距離小 = 最像）')
  hits.forEach((h, i) => near(h.score, want[i].score, `第 ${i + 1} 名的 score 要是 1 - (embedding <=> 查詢向量)`))
  assert.equal(hits[0].content, `第 ${ROWS.findIndex(r => r.docId === want[0].docId && r.seq === want[0].seq)} 塊`, '也要回傳 content')
  const sql = sqls.join('\n')
  assert.match(sql, /<=>/, 'SQL 要用 <=>（cosine 距離）讓資料庫排序，不要把全部的列拿回 JavaScript 算')
  assert.match(sql, /\blimit\b/i, 'SQL 要有 LIMIT：只拿前 k 筆')
  assert.ok(!sql.includes(toSql(QUERY).slice(1, 12)), '查詢向量要用 $1 參數傳（$1::vector），不要拼進 SQL 字串')
})

test('ORDER BY 寫成索引用得到的形式（embedding <=> 查詢向量，由小到大）', T, async () => {
  const { wrapped, calls } = recording()
  await search(wrapped, QUERY, { k: 3 })
  const call = calls.find(c => /<=>/.test(c.sql))
  assert.ok(call, 'SQL 要用 <=>')
  // 用你送出的同一句 SQL、同樣的參數跑 EXPLAIN；關掉全表掃描，看規劃器能不能用 HNSW 索引排序
  const hnsw = (await db.query<{ name: string }>(`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'chunks' AND indexdef LIKE '%USING hnsw%'`)).rows.map(r => r.name)
  const plan = await db.transaction(async tx => {
    await tx.query('SET LOCAL enable_seqscan = off')
    return (await tx.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${call.sql}`, call.params)).rows.map(r => r['QUERY PLAN']).join('\n')
  })
  assert.ok(hnsw.some(name => plan.includes(`Index Scan using ${name}`)),
    `這句 SQL 用不到 HNSW 索引：排序要直接寫 ORDER BY embedding <=> $1::vector（由小到大）再 LIMIT；寫成 ORDER BY score DESC 結果一樣，但索引永遠用不到。計畫：\n${plan}`)
})

test('k 比資料多：全部回傳，依分數排序', T, async () => {
  const hits = await search(recording().wrapped, QUERY, { k: 50 })
  assert.equal(hits.length, 30)
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score, '結果要依 score 由高到低排序')
})

test('docIds：只搜這些文件，而且先過濾再取前 k 名', T, async () => {
  const docIds = ['hours', 'membership']
  const hits = await search(recording().wrapped, QUERY, { k: 5, docIds })
  const want = expected(r => docIds.includes(r.docId)).slice(0, 5)
  assert.equal(hits.length, 5, 'docIds 的條件要寫在 SQL 的 WHERE 裡（doc_id = ANY($2)），先過濾再 LIMIT；在 LIMIT 之後才過濾會少於 k 筆')
  assert.deepEqual(hits.map(h => [h.docId, h.seq]), want.map(w => [w.docId, w.seq]), '要回傳這兩份文件裡最像的 5 塊')
})

test('minScore：低於門檻的不回傳', T, async () => {
  const all = expected()
  const minScore = (all[1].score + all[2].score) / 2   // 只有前 2 名過門檻
  const hits = await search(recording().wrapped, QUERY, { k: 5, minScore })
  assert.deepEqual(hits.map(h => [h.docId, h.seq]), all.slice(0, 2).map(w => [w.docId, w.seq]), `minScore ${minScore.toFixed(3)} 只有前 2 名過門檻，要回傳 2 筆`)
  const positive = all.filter(r => r.score >= 0).length
  assert.ok(positive < all.length, '（測試資料要有負分的塊）')
  const zero = await search(recording().wrapped, QUERY, { k: 50, minScore: 0 })
  assert.equal(zero.length, positive, `minScore 是 0 也是門檻：cosine 相似度可以是負的，這時只能回傳 ${positive} 筆分數 >= 0 的。判斷有沒有給 minScore 要用 !== undefined 或 ??，不要用 if (minScore)`)
})
