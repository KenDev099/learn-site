import '../../helpers/offline.ts'
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { DOCS } from '../../helpers/coffee.ts'
import type { Doc } from '../../helpers/coffee.ts'
import { openVectorDb, type VectorDb } from '../../helpers/pg.ts'
import { CHUNK_OPTS, chunkMarkdown, conceptEmbed, EMBED_MODEL, embedText, SCHEMA_SQL } from './kit.ts'
import { ingest } from './ex1.ts'

const T = { timeout: 120_000 }
let db: VectorDb
before(async () => { db = await openVectorDb({ seed: false }) }, T)
after(async () => { await db?.close() })
beforeEach(async () => { await db.exec('DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS docs;' + SCHEMA_SQL) })

// 假的 embedding 函式：記錄每次收到哪些文字
function fakeEmbed() {
  const calls: string[][] = []
  const embed = async (texts: string[]) => { calls.push(texts); return texts.map(conceptEmbed) }
  return { embed, calls, total: () => calls.reduce((n, c) => n + c.length, 0) }
}
const expected = (docs: Doc[]) => docs.flatMap(d => chunkMarkdown(d.id, d.markdown, CHUNK_OPTS))
type Row = { doc_id: string; seq: number; heading_path: string[]; content: string; embed_model: string }
const rows = async () => (await db.query<Row>('SELECT doc_id, seq, heading_path, content, embed_model FROM chunks ORDER BY doc_id, seq')).rows

test('第一次匯入：每份文件一列 docs，所有塊一次批次 embedding', T, async () => {
  const { embed, calls } = fakeEmbed()
  const r = await ingest(db, DOCS, embed)
  const want = expected(DOCS)
  assert.equal(calls.length, 1, `所有文件要重算的塊，合成一次 embed 呼叫；你呼叫了 ${calls.length} 次（每次呼叫都有網路延遲，也會被限流）`)
  assert.deepEqual([...calls[0]].sort(), want.map(embedText).sort(), 'embed 要收到每一塊的 embedText(chunk)（標題路徑＋內容），塊用 chunkMarkdown(doc.id, doc.markdown, CHUNK_OPTS) 切')
  assert.deepEqual(r, { embedded: want.length, deleted: 0 }, `回傳 { embedded: ${want.length}, deleted: 0 }`)
  const docs = (await db.query<{ id: string; trust: string }>('SELECT id, trust FROM docs ORDER BY id')).rows
  assert.deepEqual(docs, DOCS.map(d => ({ id: d.id, trust: d.trust })).sort((a, b) => a.id.localeCompare(b.id)), 'docs 表要有每份文件的 id 與 trust')
})

test('每一塊都有標題路徑、模型名稱，長度不超過 CHUNK_OPTS.maxChars', T, async () => {
  await ingest(db, DOCS, fakeEmbed().embed)
  const got = await rows()
  assert.equal(got.length, expected(DOCS).length, `資料表要有 ${expected(DOCS).length} 塊`)
  for (const r of got) {
    assert.ok(r.heading_path.length >= 2, `${r.doc_id} 第 ${r.seq} 塊的 heading_path 是 ${JSON.stringify(r.heading_path)}：要存 chunk.headingPath（例如 ['門市手冊', '過敏原']），模型和引用都靠它知道這段在講什麼`)
    assert.equal(r.embed_model, EMBED_MODEL, 'embed_model 要存 EMBED_MODEL：換模型時才知道哪些要重算')
    assert.ok(Array.from(r.content).length <= CHUNK_OPTS.maxChars, `${r.doc_id} 第 ${r.seq} 塊有 ${Array.from(r.content).length} 個字元，超過 maxChars ${CHUNK_OPTS.maxChars}：要用 chunkMarkdown 搭配 CHUNK_OPTS 切塊`)
  }
  const allergen = got.find(r => r.content.includes('燕麥奶不含乳糖'))
  assert.deepEqual(allergen?.heading_path, ['門市手冊', '過敏原'])
})

test('再跑一次：內容沒變，一塊都不重算', T, async () => {
  await ingest(db, DOCS, fakeEmbed().embed)
  const second = fakeEmbed()
  const r = await ingest(db, DOCS, second.embed)
  assert.equal(second.total(), 0, `內容沒變卻又送了 ${second.total()} 段去 embedding：先讀出資料庫的 content_hash 與 embed_model，一樣的就跳過（每段都要錢）`)
  assert.deepEqual(r, { embedded: 0, deleted: 0 })
  assert.equal((await rows()).length, expected(DOCS).length, '重跑之後塊數不變')
})

test('改一行、刪一節：只重算變了的塊，刪掉多出來的舊塊', T, async () => {
  await ingest(db, DOCS, fakeEmbed().embed)
  const edited = DOCS.map(d => d.id !== 'membership' ? d : {
    ...d,
    markdown: d.markdown.replace('每消費 50 元集 1 點', '每消費 40 元集 1 點').replace(/## 退款規則[\s\S]*$/, ''),
  })
  const before = expected(DOCS)
  const after = expected(edited)
  const { embed, total } = fakeEmbed()
  const r = await ingest(db, edited, embed)
  const changed = after.filter(c => !before.some(b => b.docId === c.docId && b.seq === c.seq && embedText(b) === embedText(c)))
  assert.equal(total(), changed.length, `只有 ${changed.length} 塊的內容變了，你送了 ${total()} 段去 embedding`)
  assert.equal(r.deleted, before.length - after.length, `membership 少了 ${before.length - after.length} 塊，要 DELETE 掉 seq 超出範圍的舊塊`)
  const got = await rows()
  assert.equal(got.length, after.length)
  assert.ok(got.some(x => x.content.includes('每消費 40 元')), '改過的內容要寫回資料庫')
  assert.ok(!got.some(x => x.content.includes('全額退款')), '刪掉的章節不能留在資料庫（不然還會被檢索到）')
})

test('文件的 trust 改了：docs 要跟著更新（隔離一份文件不用重算 embedding）', T, async () => {
  await ingest(db, DOCS, fakeEmbed().embed)
  const flipped = DOCS.map(d => d.id === 'menu' ? { ...d, trust: 'quarantined' as const } : d)
  const { embed, total } = fakeEmbed()
  await ingest(db, flipped, embed)
  const menu = (await db.query<{ trust: string }>(`SELECT trust FROM docs WHERE id = 'menu'`)).rows[0]
  assert.equal(menu?.trust, 'quarantined', 'docs 要用 INSERT … ON CONFLICT (id) DO UPDATE 更新 title 與 trust，不能 DO NOTHING')
  assert.equal(total(), 0, '只改了 trust，內容沒變，不用重算 embedding')
})

test('換了 embedding 模型：內容沒變的塊也要重算', T, async () => {
  await ingest(db, DOCS, fakeEmbed().embed)
  await db.exec(`UPDATE chunks SET embed_model = 'old-model' WHERE doc_id = 'menu'`)
  const { embed, total } = fakeEmbed()
  await ingest(db, DOCS, embed)
  const menu = expected(DOCS).filter(c => c.docId === 'menu').length
  assert.equal(total(), menu, `menu 的 ${menu} 塊是用舊模型算的（embed_model 不是 EMBED_MODEL），要重算；你送了 ${total()} 段。比對時 content_hash 與 embed_model 都要一樣才跳過`)
  const models = (await db.query<{ embed_model: string }>(`SELECT DISTINCT embed_model FROM chunks`)).rows.map(r => r.embed_model)
  assert.deepEqual(models, [EMBED_MODEL], '重算後 embed_model 要更新成 EMBED_MODEL')
})
