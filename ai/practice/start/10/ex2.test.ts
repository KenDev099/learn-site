import '../../helpers/offline.ts'
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { openVectorDb, toSql, type VectorDb } from '../../helpers/pg.ts'
import { mulberry32 } from '../../helpers/clock.ts'
import { hybridSearch, KEYWORD_SQL, TRGM_INDEX_SQL, type Hit } from './ex2.ts'

// 測試資料：向量是手工做的，模擬「真的語意模型」：
//   SKU 那段的向量離問題最遠（向量模型不懂編號），只有關鍵字找得到
//   植物奶那段跟問題沒有共同的字，但向量最近（語意相近），只有向量找得到
const DIM = 64
const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map(x => x / n) }
const axis = (i: number, w = 1) => Array.from({ length: DIM }, (_, j) => (j === i ? w : 0))
const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i])
const Q = axis(0)
const SKU = '拿鐵 110 元：濃縮咖啡加鮮奶，可改燕麥奶（SKU-0042），加價 10 元。'
const PLANT = '植物奶每天早上補充，當天賣完就不再供應。'
const BOTH = '燕麥奶（SKU-0042）缺貨時，店員會在點餐時告知。'
const FILLERS = [
  '美式咖啡 80 元：每日現磨的中焙咖啡豆。', '卡布奇諾 110 元：奶泡比拿鐵厚。', '伯爵紅茶 90 元：可選熱的或冰的。',
  '可頌 70 元：每天早上 7 點出爐，含奶油與小麥。', '起司蛋糕 120 元：含蛋、奶、小麥，每日限量 20 份。',
  '週一到週五 07:00–19:00。', '週六、週日 08:00–18:00。', '國定假日照常營業，農曆除夕公休。',
  '可頌含奶油與小麥（麩質）。', '起司蛋糕含蛋、奶、小麥。', '有嚴重過敏的顧客，請點餐時告訴店員。',
  '每消費 50 元集 1 點，滿 10 點可兌換一杯美式咖啡。', '點數有效期限 1 年，不能轉讓、不能折現。',
  '飲品製作前可全額退款。', '製作後品質有問題，30 分鐘內帶發票到店可重做一杯或退款。', '線上訂單取消請在取餐時間前 15 分鐘。',
  '戶外座位可以帶寵物，室內不行。', '靠窗座位有插座。', '外帶杯可以回收，請投入門口的回收桶。', '店內提供免費無線網路，密碼貼在櫃檯。',
  '咖啡豆可以代磨，請告訴店員要用的器具。', '團體訂購十杯以上請提前一天預約。', '停車請使用附近的公有停車場。',
  '禮物卡可以在櫃檯購買與儲值。', '雨天提供傘套。', '音樂音量可以請店員調整。', '自備杯折價 5 元。',
]
type Row = { doc: string; path: string[]; content: string; vec: number[] }
const random = mulberry32(10)
const rows: Row[] = [
  ...FILLERS.slice(0, 13).map((c, i) => ({ doc: 'menu', path: ['菜單'], content: c, vec: unit(Array.from({ length: DIM }, () => random() - 0.5)) })),
  { doc: 'menu', path: ['菜單', '咖啡'], content: SKU, vec: unit(add(axis(0, -1), axis(5, 0.1))) },
  { doc: 'hours', path: ['門市手冊', '植物奶'], content: PLANT, vec: unit(add(Q, axis(1, 0.3))) },
  { doc: 'hours', path: ['門市手冊', '庫存'], content: BOTH, vec: unit(add(Q, axis(2, 0.5))) },
  ...FILLERS.slice(13).map((c, i) => ({ doc: 'faq', path: ['常見問題'], content: c, vec: unit(Array.from({ length: DIM }, () => random() - 0.5)) })),
]
const esc = (s: string) => s.replaceAll("'", "''")
const SEED = `
CREATE TABLE chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, doc_id text NOT NULL, seq integer NOT NULL,
  heading_path text[] NOT NULL DEFAULT '{}', content text NOT NULL, content_hash text NOT NULL,
  embedding vector(64) NOT NULL, embed_model text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, seq));
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model) VALUES
${rows.map((r, i) => `('${r.doc}', ${i}, ARRAY[${r.path.map(p => `'${esc(p)}'`).join(',')}]::text[], '${esc(r.content)}', 'h${i}', '${toSql(r.vec)}', 'test')`).join(',\n')};
`

let db: VectorDb
let indexError: unknown = null
before(async () => {
  db = await openVectorDb({ seed: SEED })
  try { await db.exec(TRGM_INDEX_SQL) } catch (e) { indexError = e }
}, { timeout: 120_000 })
after(async () => { await db?.close() })

const find = (hits: Hit[], content: string) => hits.find(h => h.content === content)
const opts = { timeout: 120_000 }

test('TRGM_INDEX_SQL 在 chunks.content 建 pg_trgm 的 GIN 索引', opts, async () => {
  assert.equal(indexError, null, `TRGM_INDEX_SQL 執行失敗：${indexError}`)
  const idx = (await db.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE tablename = 'chunks'`)).rows.map(r => r.indexdef)
  assert.ok(idx.some(d => /USING gin \(content gin_trgm_ops\)/.test(d)),
    `要有 USING gin (content gin_trgm_ops) 的索引；目前 chunks 的索引：\n${idx.join('\n')}`)
})

test('KEYWORD_SQL 用得到 trigram 的 GIN 索引（條件要寫成 <% 運算子，不是 word_similarity(…) > 0.1）', opts, async () => {
  assert.ok(KEYWORD_SQL.trim(), 'KEYWORD_SQL 還是空的')
  assert.doesNotMatch(KEYWORD_SQL, /to_tsvector|tsquery/i, 'simple 全文檢索不會切中文（「燕麥奶」找不到），關鍵字這一路改用 pg_trgm')
  await db.exec('SET enable_seqscan = off')
  try {
    const plan = (await db.query<Record<string, string>>('EXPLAIN ' + KEYWORD_SQL, ['燕麥奶', 20])).rows.map(r => r['QUERY PLAN']).join('\n')
    assert.match(plan, /Index Cond: \(content %> /, `關鍵字這一路要走 trgm 索引。把篩選寫成 WHERE $1 <% content（門檻用 pg_trgm.word_similarity_threshold），函式寫法 word_similarity($1, content) > 0.1 用不到索引。你的查詢計畫：\n${plan}`)
  } finally {
    await db.exec('RESET enable_seqscan')
  }
})

test('KEYWORD_SQL 依 word_similarity 由高到低排序（同分依 id），只取前 $2 筆', opts, async () => {
  const ref = `SELECT id::text AS id FROM chunks WHERE word_similarity($1, content) > 0.1 ORDER BY word_similarity($1, content) DESC, id LIMIT $2`
  for (const [q, n] of [['燕麥奶', 20], ['咖啡豆 現磨', 20], ['可頌 奶油', 3]] as const) {
    const [got, want] = await db.transaction(async tx => {
      await tx.exec('SET LOCAL pg_trgm.word_similarity_threshold = 0.1')
      const a = (await tx.query<{ id: string }>(KEYWORD_SQL, [q, n])).rows.map(r => String(r.id))
      const b = (await tx.query<{ id: string }>(ref, [q, n])).rows.map(r => r.id)
      return [a, b]
    })
    assert.deepEqual(got, want, `問題「${q}」：排序要用 word_similarity($1, content)（短問題比長段落），不是 similarity；同分依 id，最多 ${n} 筆`)
  }
})

test('混合搜尋：只有關鍵字找得到的 SKU 那段、只有向量找得到的植物奶那段，都在前 5 名', opts, async () => {
  const hits = await hybridSearch(db, 'SKU-0042 還有貨嗎', Q, 5)
  assert.equal(hits.length, 5, '要回傳前 k（5）筆')
  const sku = find(hits, SKU), plant = find(hits, PLANT), both = find(hits, BOTH)
  assert.ok(sku, `「SKU-0042」那段的向量離問題最遠，只靠向量找不到：要加上關鍵字那一路。你的結果：${hits.map(h => h.content.slice(0, 12)).join('｜')}`)
  assert.ok(plant, '「植物奶」那段跟問題沒有共同的字，只有向量找得到：向量那一路也要保留')
  assert.ok(both, '兩路都有的那段一定要在結果裡')
  assert.equal(hits[0].content, BOTH, '兩路都找到的那段（向量第 2、關鍵字前 2）RRF 分數最高，要排第一')
  assert.deepEqual([sku.vectorRank, plant.keywordRank], [null, null], '沒出現在某一路時，那一路的名次是 null')
  assert.equal(plant.vectorRank, 1, '植物奶那段在向量那一路是第 1 名')
  assert.equal(both.vectorRank, 2, '兩路都有的那段在向量那一路是第 2 名')
  assert.deepEqual([sku.keywordRank, both.keywordRank].sort(), [1, 2], '兩段含 SKU-0042 的在關鍵字那一路是第 1、2 名')
  for (const h of hits) {
    const expected = (h.vectorRank ? 1 / (60 + h.vectorRank) : 0) + (h.keywordRank ? 1 / (60 + h.keywordRank) : 0)
    assert.ok(Math.abs(h.score - expected) < 1e-12, `score 要是 RRF 分數（用練習 1 的 rrf，k = 60），不是把兩路的原始分數相加：${h.content.slice(0, 10)} 預期 ${expected}，你的是 ${h.score}`)
  }
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score, '結果要依 RRF 分數由高到低')
  assert.deepEqual(both.headingPath, ['門市手冊', '庫存'], '要補上 heading_path（陣列）')
  assert.equal(both.docId, 'hours', '要補上 doc_id')
  assert.equal(typeof both.id, 'string', 'id 用文字（SQL 裡 id::text）')
})

test('短的關鍵字（word_similarity 只有 0.5）也找得到：門檻要設成 0.1', opts, async () => {
  const hits = await hybridSearch(db, '燕麥奶', axis(9), 3)
  const sku = find(hits, SKU)
  assert.ok(sku && sku.keywordRank !== null, `「燕麥奶」跟 SKU 那段的 word_similarity 是 0.5，預設門檻 0.6 會把它擋掉：查詢前要 SET LOCAL pg_trgm.word_similarity_threshold = 0.1。你的結果：${hits.map(h => h.content.slice(0, 12)).join('｜')}`)
  assert.equal(hits.length, 3, 'k = 3 時回傳 3 筆')
})

test('門檻只影響這次查詢：查完之後連線的設定還是預設的 0.6', opts, async () => {
  await hybridSearch(db, '燕麥奶', Q, 3)
  const { rows } = await db.query<Record<string, string>>('SHOW pg_trgm.word_similarity_threshold')
  assert.equal(Number(rows[0]['pg_trgm.word_similarity_threshold']), 0.6,
    '用 SET 會改到整條連線（正式環境的連線池會把它帶給下一個請求）：在 db.transaction 裡用 SET LOCAL，交易結束就恢復')
})
