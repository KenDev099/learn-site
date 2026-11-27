import '../../helpers/offline.ts'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import type { VectorDb } from '../../helpers/pg.ts'
import { openChunksDb, randomVectors, insertRows, cosineSim, type Row } from './fixtures.ts'
import { explainUsesIndex, searchFiltered } from './ex4.ts'

// 練習 4 用練習 1 的 ex1.sql 建表，所以先做完練習 1
const T = { timeout: 120_000 }
const vectors = randomVectors(1000, 21)
// 1,000 塊裡只有 30 塊（3%）屬於 allergens
const ROWS: Row[] = vectors.map((embedding, i) => ({ docId: i % 33 === 5 ? 'allergens' : `doc${i % 10}`, seq: i, content: `第 ${i} 塊`, embedding }))
const QUERIES = randomVectors(8, 5)

let db: VectorDb
// ANALYZE 讓規劃器知道表裡有多少資料（只有 1,000 筆時它會選全表掃描）
before(async () => { db = await openChunksDb(); await insertRows(db, ROWS); await db.exec('ANALYZE chunks') }, T)
after(async () => { await db?.close() })

const show = async (name: string) => Object.values((await db.query<Record<string, string>>(`SHOW ${name}`)).rows[0])[0]
const hnswIndexes = async () => (await db.query<{ name: string }>(`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'chunks' AND indexdef LIKE '%USING hnsw%'`)).rows

test('explainUsesIndex：有 HNSW cosine 索引時回傳 true，而且不改到連線的設定', T, async () => {
  assert.ok((await hnswIndexes()).length, '練習 1 的 ex1.sql 要建好 HNSW 索引')
  assert.equal(await explainUsesIndex(db, QUERIES[0]), true, '有 HNSW 索引時要回傳 true。資料只有 1,000 筆時規劃器會選全表掃描，要在交易裡 SET LOCAL enable_seqscan = off 再 EXPLAIN')
  assert.equal(await show('enable_seqscan'), 'on', 'enable_seqscan 要用 SET LOCAL，交易結束就恢復；用 SET 會讓這條連線之後的查詢都不能全表掃描')
})

test('explainUsesIndex：索引不存在、或運算子類別不對（vector_l2_ops）時回傳 false', T, async () => {
  for (const { name } of await hnswIndexes()) await db.exec(`DROP INDEX "${name}"`)
  try {
    assert.equal(await explainUsesIndex(db, QUERIES[0]), false, '刪掉索引後要回傳 false：從 EXPLAIN 的結果判斷，不要寫死 true')
    await db.exec('CREATE INDEX chunks_l2_test ON chunks USING hnsw (embedding vector_l2_ops)')
    assert.equal(await explainUsesIndex(db, QUERIES[0]), false, '只有 vector_l2_ops 的索引時，ORDER BY embedding <=> … 用不到它，要回傳 false（找計畫裡的 Index Scan using … on chunks）')
  } finally {
    await db.exec('DROP INDEX IF EXISTS chunks_l2_test; CREATE INDEX chunks_hnsw_test ON chunks USING hnsw (embedding vector_cosine_ops)')
  }
})

test('searchFiltered：只有 3% 的資料符合 docId，仍然拿到 k 筆，依分數排序', T, async () => {
  // 模擬大資料表：規劃器選 HNSW 索引（測試把 doc_id 的 B-tree 索引拿掉，並關掉全表掃描）
  const uniques = (await db.query<{ name: string }>(`SELECT conname AS name FROM pg_constraint WHERE conrelid = 'chunks'::regclass AND contype = 'u'`)).rows
  for (const { name } of uniques) await db.exec(`ALTER TABLE chunks DROP CONSTRAINT "${name}"`)
  const btrees = (await db.query<{ name: string }>(`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'chunks' AND indexdef NOT LIKE '%USING hnsw%' AND indexname NOT LIKE '%pkey'`)).rows
  for (const { name } of btrees) await db.exec(`DROP INDEX "${name}"`)
  await db.exec('SET enable_seqscan = off')
  try {
    for (const q of QUERIES) {
      const hits = await searchFiltered(db, q, { k: 5, docId: 'allergens' })
      assert.equal(hits.length, 5, `只拿到 ${hits.length} 筆：HNSW 先取 40 個候選再套 WHERE，剩下的不夠。要在交易裡 SET LOCAL hnsw.iterative_scan = relaxed_order，而且 doc_id 條件要寫在 SQL 的 WHERE 裡`)
      assert.ok(hits.every(h => h.docId === 'allergens'), '只能回傳 docId 是 allergens 的塊')
      for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score, 'relaxed_order 的結果可能稍微亂序：用 MATERIALIZED CTE 包起來再 ORDER BY distance + 0')
      for (const h of hits) assert.ok(Math.abs(h.score - cosineSim(q, ROWS[h.seq].embedding)) < 1e-5, 'score 要是 1 - cosine 距離')
    }
    assert.equal(await show('hnsw.iterative_scan'), 'off', 'hnsw.iterative_scan 要用 SET LOCAL，只在這個交易裡生效；查完之後這條連線要回到 off')
  } finally {
    await db.exec('RESET enable_seqscan')
  }
})
