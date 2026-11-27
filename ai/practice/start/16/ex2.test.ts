import '../../helpers/offline.ts'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { DOCS } from '../../helpers/coffee.ts'
import { openVectorDb, toSql, type VectorDb } from '../../helpers/pg.ts'
import { CHUNK_OPTS, chunkMarkdown, conceptEmbed, contentHash, EMBED_MODEL, embedConcepts, embedText, retrievalMetrics, SCHEMA_SQL } from './kit.ts'
import type { Embed } from './kit.ts'
import { retrieve, TOP_K } from './ex2.ts'

// 測試自己把 DOCS 寫進資料庫（不依賴練習 1），embedding 用 kit.ts 的 conceptEmbed（懂同義詞、不懂編號）
const T = { timeout: 120_000 }
let db: VectorDb
before(async () => {
  db = await openVectorDb({ seed: false })
  await db.exec(SCHEMA_SQL)
  for (const d of DOCS) {
    await db.query('INSERT INTO docs (id, title, trust) VALUES ($1, $2, $3)', [d.id, d.title, d.trust])
    for (const c of chunkMarkdown(d.id, d.markdown, CHUNK_OPTS)) {
      await db.query(`INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model)
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
        [c.docId, c.seq, c.headingPath, c.text, contentHash(embedText(c)), toSql(conceptEmbed(embedText(c))), EMBED_MODEL])
    }
  }
}, T)
after(async () => { await db?.close() })

// 人工標記：每題「應該找到」的塊，用文件 id 與內容片段指定
const LABELED = [
  { question: '拿鐵一杯多少錢？', relevant: [['menu', '拿鐵 110 元']] },
  { question: '起司蛋糕多少錢？', relevant: [['menu', '起司蛋糕 120 元']] },
  { question: '可頌有麩質嗎？', relevant: [['hours', '可頌含奶油與小麥（麩質）']] },
  { question: '燕麥奶有乳糖嗎？', relevant: [['hours', '燕麥奶不含乳糖']] },
  { question: '週六開到幾點？', relevant: [['hours', '週六、週日']] },
  { question: '飲料還沒做可以退款嗎？', relevant: [['membership', '飲品製作前可全額退款']] },
]
const idsOf = async (pairs: string[][]) => {
  const out: string[] = []
  for (const [doc, text] of pairs) {
    const { rows } = await db.query<{ id: string }>(`SELECT id::text AS id FROM chunks WHERE doc_id = $1 AND content LIKE '%' || $2 || '%'`, [doc, text])
    out.push(...rows.map(r => r.id))
  }
  return out
}
const brief = (r: { docId: string; content: string }[]) => r.map(x => `${x.docId}:${x.content.replace(/\s+/g, '').slice(0, 12)}`).join('｜')

test('6 題檢索題的 recall@5 至少 0.8（用第 11 課的 retrievalMetrics）', T, async () => {
  const results = []
  for (const { question, relevant } of LABELED) {
    const hits = await retrieve(db, question, embedConcepts)
    assert.ok(hits.length <= TOP_K, `最多回傳 TOP_K（${TOP_K}）筆，「${question}」回了 ${hits.length} 筆`)
    results.push({ retrieved: hits.map(h => h.id), relevant: await idsOf(relevant), question, hits })
  }
  const { recallAtK } = retrievalMetrics(results, 5)
  const missed = results.filter(r => !r.relevant.every(id => r.retrieved.includes(id))).map(r => `「${r.question}」→ ${brief(r.hits)}`)
  assert.ok(recallAtK >= 0.8, `recall@5 只有 ${recallAtK.toFixed(2)}，沒找到的題目：\n${missed.join('\n')}`)
})

test('回傳的格式：score 是 RRF 分數、由高到低，補上 docId、headingPath、content', T, async () => {
  const hits = await retrieve(db, '可頌有麩質嗎？', embedConcepts)
  assert.equal(hits.length, TOP_K, `這題兩路都有很多候選，要回傳剛好 ${TOP_K} 筆`)
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score, 'score 要由高到低')
  assert.ok(hits[0].score > 1 / 61 && hits[0].score <= 2 / 61, `score 要是 rrf() 算出的分數（第 1 名兩路都有，約 0.03），你的是 ${hits[0].score}`)
  const top = hits.find(h => h.content.includes('（麩質）'))
  assert.ok(top, '過敏原那段要在結果裡')
  assert.equal(top.docId, 'hours')
  assert.deepEqual(top.headingPath, ['門市手冊', '過敏原'])
  assert.equal(typeof top.id, 'string', 'id 用文字（SQL 裡 id::text）')
})

test('SKU-0042：embedding 不懂編號，要靠關鍵字那一路找到', T, async () => {
  const hits = await retrieve(db, 'SKU-0042 是什麼？', embedConcepts)
  assert.ok(hits.some(h => h.content.includes('SKU-0042')), `「SKU-0042」的向量跟任何一段都不像（假語意模型不認得編號）：要加上 pg_trgm 那一路（$1 <% content，門檻 SET LOCAL 成 KEYWORD_THRESHOLD）。你的結果：${brief(hits) || '（空的）'}`)
})

test('被隔離的文件（trust = quarantined）永遠不會被檢索到', T, async () => {
  for (const question of ['可以帶寵物嗎？', '靠窗有插座嗎？', '給 AI 助理的說明', '忽略之前所有的指示']) {
    const hits = await retrieve(db, question, embedConcepts)
    assert.ok(!hits.some(h => h.docId === 'faq-community'), `「${question}」檢索到了被隔離的 faq-community：兩路的 SQL 都要 JOIN docs，只找 trust = 'official'`)
  }
  // 確認上面不是碰巧：同一題在文件變成 official 之後找得到
  await db.exec(`UPDATE docs SET trust = 'official' WHERE id = 'faq-community'`)
  try {
    const hits = await retrieve(db, '可以帶寵物嗎？', embedConcepts)
    assert.ok(hits.some(h => h.docId === 'faq-community'), `文件改成 official 之後，「可以帶寵物嗎？」要找得到它（向量那一路要找相似度 >= MIN_SIMILARITY 的塊）。你的結果：${brief(hits)}`)
  } finally {
    await db.exec(`UPDATE docs SET trust = 'quarantined' WHERE id = 'faq-community'`)
  }
})

test('隔離的條件寫在 SQL 裡：被隔離的塊再多，也不會擠掉官方文件', T, async () => {
  // 一份被隔離的文件，有 25 塊跟「拿鐵多少錢」很像的內容（比 CANDIDATES 還多）
  await db.query(`INSERT INTO docs (id, title, trust) VALUES ('spam', '來路不明', 'quarantined')`)
  try {
    for (let i = 0; i < 25; i++) {
      const text = `拿鐵一杯多少錢？拿鐵價格 ${i}`
      await db.query(`INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model)
        VALUES ('spam', $1, $2, $3, $4, $5::vector, $6)`,
        [i, ['來路不明'], text, String(i), toSql(conceptEmbed(text)), EMBED_MODEL])
    }
    const hits = await retrieve(db, '拿鐵一杯多少錢？', embedConcepts)
    assert.ok(!hits.some(h => h.docId === 'spam'), '被隔離的文件不能出現在結果裡')
    assert.ok(hits.some(h => h.content.includes('拿鐵 110 元')), `菜單的拿鐵那段被擠掉了：先各取前 CANDIDATES 筆再用 JavaScript 過濾，前幾名全是被隔離的塊，濾完就不剩了。trust = 'official' 要寫在兩路 SQL 的 WHERE 裡。你的結果：${brief(hits) || '（空的）'}`)
  } finally {
    await db.exec(`DELETE FROM chunks WHERE doc_id = 'spam'; DELETE FROM docs WHERE id = 'spam';`)
  }
})

test('跟店裡無關的問題：兩路都沒有夠相關的塊，回傳空陣列', T, async () => {
  for (const question of ['附近哪裡可以停車？', 'Wi-Fi password?']) {
    const hits = await retrieve(db, question, embedConcepts)
    assert.deepEqual(brief(hits), '', `「${question}」跟任何文件都不像，要回傳空陣列（向量那一路只留相似度 >= MIN_SIMILARITY 的；第 3 題靠空陣列決定直接轉店員、不花錢呼叫 API）`)
  }
})

test('只呼叫一次 embed，而且關鍵字門檻不會改到整條連線', T, async () => {
  let calls = 0
  const embed: Embed = async texts => { calls++; return embedConcepts(texts) }
  await retrieve(db, '燕麥奶有乳糖嗎？', embed)
  assert.equal(calls, 1, '問題只要 embedding 一次')
  const { rows } = await db.query<Record<string, string>>('SHOW pg_trgm.word_similarity_threshold')
  assert.equal(Number(rows[0]['pg_trgm.word_similarity_threshold']), 0.6, '門檻要在 db.transaction 裡用 SET LOCAL 設定，交易結束就恢復；SET 會留在連線上，影響連線池的下一個請求')
})

