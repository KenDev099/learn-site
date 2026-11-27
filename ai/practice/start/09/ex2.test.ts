import '../../helpers/offline.ts'
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toyEmbed } from '../../helpers/toy-embed.ts'
import type { VectorDb } from '../../helpers/pg.ts'
import { openChunksDb } from './fixtures.ts'
import { upsertDoc, embedText, contentHash, type ChunkInput } from './ex2.ts'

// 練習 2 用練習 1 的 ex1.sql 建表，所以先做完練習 1
const T = { timeout: 120_000 }
let db: VectorDb
before(async () => { db = await openChunksDb() }, T)
after(async () => { await db?.close() })
beforeEach(async () => { await db.exec('TRUNCATE chunks') })

// 假的 embedding 函式：記錄每次收到哪些文字，回傳 toyEmbed 的結果
function fakeEmbed(opts: { fail?: boolean; badDimAt?: number } = {}) {
  const calls: string[][] = []
  const embed = async (texts: string[]) => {
    calls.push(texts)
    if (opts.fail) throw new Error('embedding API 逾時')
    return texts.map((t, i) => i === opts.badDimAt ? toyEmbed(t, 63) : toyEmbed(t))
  }
  return { embed, calls }
}

const FAQ: ChunkInput[] = [
  { seq: 0, headingPath: ['常見問題', '營業時間'], content: '平日 07:30–20:00，週末 08:00–18:00。' },
  { seq: 1, headingPath: ['常見問題', '過敏原'], content: '起司蛋糕含蛋、奶、小麥，不含堅果。' },
  { seq: 2, headingPath: ['常見問題', '過敏原'], content: '可頌含奶油與小麥。' },
  { seq: 3, headingPath: ['常見問題', '會員'], content: '每消費 100 元集 1 點。' },
  { seq: 4, headingPath: ['常見問題', '退款'], content: '未製作的訂單可以全額退款。' },
]

type Stored = { doc_id: string; seq: number; heading_path: string[]; content: string; content_hash: string; embed_model: string; dims: number }
async function rows(docId = 'faq') {
  return (await db.query<Stored>(
    `SELECT doc_id, seq, heading_path, content, content_hash, embed_model, vector_dims(embedding) AS dims
     FROM chunks WHERE doc_id = $1 ORDER BY seq`, [docId])).rows
}

test('第一次寫入：5 塊一次批次 embed，存進雜湊、模型、標題路徑', T, async () => {
  const { embed, calls } = fakeEmbed()
  const r = await upsertDoc(db, 'faq', FAQ, embed, 'toy-64')
  assert.equal(calls.length, 1, `embed 要一次批次呼叫，你呼叫了 ${calls.length} 次（每次呼叫都有網路延遲，也可能被限流）`)
  assert.deepEqual(calls[0], FAQ.map(embedText), 'embed 要收到 5 段文字，用寫好的 embedText(c)（標題路徑＋內容）')
  assert.deepEqual(r, { embedded: 5, deleted: 0 })
  const got = await rows()
  assert.equal(got.length, 5)
  assert.deepEqual(got[1].heading_path, ['常見問題', '過敏原'])
  assert.equal(got[1].content_hash, contentHash(embedText(FAQ[1])), 'content_hash 要存 contentHash(embedText(c))')
  assert.equal(got[1].embed_model, 'toy-64', 'embed_model 要存傳進來的 model')
})

test('改一塊、文件縮成 4 塊：只重算改過的那塊，刪掉多出來的', T, async () => {
  await upsertDoc(db, 'faq', FAQ, fakeEmbed().embed, 'toy-64')
  const edited = FAQ.slice(0, 4).map(c => c.seq === 2 ? { ...c, content: '可頌含奶油、小麥與蛋。' } : c)
  const { embed, calls } = fakeEmbed()
  const r = await upsertDoc(db, 'faq', edited, embed, 'toy-64')
  assert.deepEqual(calls, [[embedText(edited[2])]], '只有 seq 2 的內容變了，embed 只能收到這一段：用 content_hash 比對，沒變的不要重算（embedding 要花錢）')
  assert.deepEqual(r, { embedded: 1, deleted: 1 })
  const got = await rows()
  assert.deepEqual(got.map(g => g.seq), [0, 1, 2, 3], '文件縮成 4 塊，seq 4 要刪掉，不然會搜到已經不存在的內容')
  assert.equal(got[2].content, '可頌含奶油、小麥與蛋。', 'seq 2 要更新成新內容（ON CONFLICT … DO UPDATE）')
  assert.equal(got[2].content_hash, contentHash(embedText(edited[2])), 'content_hash 也要一起更新')
})

test('內容完全沒變：不呼叫 embed', T, async () => {
  await upsertDoc(db, 'faq', FAQ, fakeEmbed().embed, 'toy-64')
  const { embed, calls } = fakeEmbed()
  const r = await upsertDoc(db, 'faq', FAQ, embed, 'toy-64')
  assert.equal(calls.length, 0, '沒有任何塊需要重算時，不要呼叫 embed（連空陣列也不要送）')
  assert.deepEqual(r, { embedded: 0, deleted: 0 })
})

test('換了 embedding 模型：內容沒變也要全部重算', T, async () => {
  await upsertDoc(db, 'faq', FAQ, fakeEmbed().embed, 'toy-64')
  const { embed, calls } = fakeEmbed()
  await upsertDoc(db, 'faq', FAQ, embed, 'toy-64-v2')
  assert.equal(calls.flat().length, 5, '模型換了，舊向量跟新模型的向量不能比較：embed_model 不同的塊也要重算')
  assert.ok((await rows()).every(g => g.embed_model === 'toy-64-v2'), 'embed_model 要更新成新的模型')
})

test('只動自己這份文件：別的文件的塊不能被刪掉', T, async () => {
  await upsertDoc(db, 'hours', FAQ.slice(0, 5), fakeEmbed().embed, 'toy-64')
  await upsertDoc(db, 'faq', FAQ.slice(0, 2), fakeEmbed().embed, 'toy-64')
  assert.equal((await rows('hours')).length, 5, '刪除多出來的塊時要加上 doc_id 條件，不然會刪到別的文件')
  assert.equal((await rows('faq')).length, 2)
})

test('embed 在交易外呼叫：不要在交易裡等外部 API', T, async () => {
  let inTx = false
  const tracked = {
    query: db.query.bind(db),
    transaction: (async (fn: Parameters<VectorDb['transaction']>[0]) => {
      inTx = true
      try { return await db.transaction(fn) } finally { inTx = false }
    }) as VectorDb['transaction'],
  }
  const seen: boolean[] = []
  const embed = async (texts: string[]) => { seen.push(inTx); return texts.map(t => toyEmbed(t)) }
  await upsertDoc(tracked, 'faq', FAQ, embed, 'toy-64')
  assert.deepEqual(seen, [false], 'embed 要在 db.transaction 之前呼叫：外部 API 可能要好幾秒，在交易裡等它會一直佔住連線和鎖。先拿到全部向量，再開交易寫入')
})

test('embed 失敗：資料表維持原狀', T, async () => {
  await upsertDoc(db, 'faq', FAQ, fakeEmbed().embed, 'toy-64')
  const before = await rows()
  const edited = FAQ.slice(0, 3).map(c => ({ ...c, content: c.content + '（更新）' }))
  await assert.rejects(upsertDoc(db, 'faq', edited, fakeEmbed({ fail: true }).embed, 'toy-64'), 'embed 丟錯時要往外丟')
  assert.deepEqual(await rows(), before, 'embed 失敗後資料表要跟原本一樣：不能先刪舊的塊再 embed')
})

test('寫到一半出錯：整份文件的修改全部回滾（交易）', T, async () => {
  await upsertDoc(db, 'faq', FAQ, fakeEmbed().embed, 'toy-64')
  const before = await rows()
  const edited = FAQ.slice(0, 4).map(c => ({ ...c, content: c.content + '（更新）' }))
  // 第 3 個向量只有 63 維，寫到第 3 塊時資料庫會拒絕
  await assert.rejects(upsertDoc(db, 'faq', edited, fakeEmbed({ badDimAt: 2 }).embed, 'toy-64'), '有一塊寫入失敗時要往外丟')
  assert.deepEqual(await rows(), before, '第 3 塊寫入失敗，前 2 塊的更新和刪除也要回滾：寫入與刪除要放在同一個 db.transaction 裡，交易裡用 tx.query')
})

test('內容有單引號也能寫入（SQL 一律用參數）', T, async () => {
  const chunks: ChunkInput[] = [{ seq: 0, headingPath: ["店員's 推薦"], content: "店員's 推薦：燕麥拿鐵；'; DROP TABLE chunks; --" }]
  await upsertDoc(db, 'faq', chunks, fakeEmbed().embed, 'toy-64')
  const got = await rows()
  assert.equal(got[0]?.content, chunks[0].content, '內容要原封不動存進去：用 $1、$2 參數，不要把值拼進 SQL 字串')
  const src = readFileSync(new URL('./ex2.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /query\(\s*`[^`]*\$\{/, 'SQL 字串裡不要用 ${…} 拼接值，改用 $1、$2 參數')
})
