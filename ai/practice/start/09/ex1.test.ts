import '../../helpers/offline.ts'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openVectorDb, toSql, type VectorDb } from '../../helpers/pg.ts'

const SQL = readFileSync(new URL('./ex1.sql', import.meta.url), 'utf8')
const T = { timeout: 120_000 }
let db: VectorDb

before(async () => { db = await openVectorDb({ seed: false }) }, T)
after(async () => { await db?.close() })

test('ex1.sql 可以連續執行兩次（每一句都要 IF NOT EXISTS）', T, async () => {
  assert.match(SQL.replace(/--.*$/gm, ''), /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+vector/i, '第一句要啟用 vector 擴充：CREATE EXTENSION IF NOT EXISTS vector')
  await db.exec(SQL)
  await assert.doesNotReject(db.exec(SQL), '第二次執行 ex1.sql 出錯了：CREATE TABLE 與 CREATE INDEX 都要加 IF NOT EXISTS（索引要取名字才能加）')
})

test('欄位的型別與 NOT NULL：embedding 是 vector(64)', T, async () => {
  const { rows } = await db.query<{ name: string; type: string; notnull: boolean }>(
    `SELECT attname AS name, format_type(atttypid, atttypmod) AS type, attnotnull AS notnull
     FROM pg_attribute WHERE attrelid = to_regclass('chunks') AND attnum > 0 AND NOT attisdropped`)
  assert.ok(rows.length, '找不到 chunks 表')
  const col = Object.fromEntries(rows.map(r => [r.name, r]))
  const want: Record<string, string> = {
    doc_id: 'text', seq: 'integer', heading_path: 'text[]', content: 'text', content_hash: 'text',
    embedding: 'vector(64)', embed_model: 'text', updated_at: 'timestamp with time zone',
  }
  for (const [name, type] of Object.entries(want)) {
    assert.ok(col[name], `chunks 少了 ${name} 欄位`)
    assert.equal(col[name].type, type, `${name} 的型別要是 ${type}${name === 'embedding' ? '（用 pgvector 的 vector(64)，維度寫在型別上；real[]、jsonb、沒寫維度的 vector 都不行）' : ''}`)
    assert.equal(col[name].notnull, true, `${name} 要加 NOT NULL`)
  }
})

test('同一份文件的 seq 不能重複：UNIQUE (doc_id, seq)', T, async () => {
  const { rows } = await db.query<{ def: string }>(`SELECT indexdef AS def FROM pg_indexes WHERE tablename = 'chunks'`)
  assert.ok(rows.some(r => /CREATE UNIQUE INDEX .*\(doc_id, seq\)$/.test(r.def)), '要有 UNIQUE (doc_id, seq)：練習 2 的 ON CONFLICT (doc_id, seq) 靠它判斷「已經有這一塊」')
})

test('embedding 有 HNSW 索引，運算子類別是 vector_cosine_ops', T, async () => {
  const { rows } = await db.query<{ def: string }>(`SELECT indexdef AS def FROM pg_indexes WHERE tablename = 'chunks'`)
  const hnsw = rows.filter(r => /USING hnsw/.test(r.def))
  assert.ok(hnsw.length, '找不到 USING hnsw 的索引')
  assert.ok(hnsw.some(r => /\(embedding vector_cosine_ops\)/.test(r.def)), `HNSW 索引要用 vector_cosine_ops（查詢用 <=>），現在是：${hnsw.map(r => r.def).join('；')}`)
})

test('資料庫擋得住錯的維度，updated_at 有預設值', T, async () => {
  const v = (n: number) => toSql(Array.from({ length: n }, (_, i) => (i + 1) / n))
  const insert = `INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model) VALUES ($1, $2, '{}', 'x', 'h', $3::vector, 'toy-64')`
  await assert.doesNotReject(db.query(insert, ['t', 0, v(64)]), '64 維的向量要能寫入（沒給 updated_at 時要用預設值 now()）')
  await assert.rejects(db.query(insert, ['t', 1, v(63)]), '63 維的向量要被資料庫拒絕：embedding 的型別要寫成 vector(64)')
  await assert.rejects(db.query(insert, ['t', 0, v(64)]), '同一個 doc_id＋seq 寫兩次要被 UNIQUE 擋下')
})
