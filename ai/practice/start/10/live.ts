// 用真的 API 跑一次（選用，不影響判分）。四題都做完後，在 ai/practice 執行：
//   node --env-file-if-exists=.env work/10/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…。embedding 用玩具的 toyEmbed，重排用 cosine 代替（真正的 reranker 見課文），所以檢索品質只是示範
// answerWithSources 固定用 ex4.ts 的 MODEL（claude-opus-5-5，測試會檢查），這裡不看 AI_MODEL
import Anthropic from '@anthropic-ai/sdk'
import { DOCS } from '../../helpers/coffee.ts'
import { openVectorDb, toSql } from '../../helpers/pg.ts'
import { cosine, toyEmbed } from '../../helpers/toy-embed.ts'
import { hybridSearch, TRGM_INDEX_SQL } from './ex2.ts'
import { answerWithSources, MODEL } from './ex4.ts'

// 每百萬 token 的美元價格（2026-11-01 官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

const db = await openVectorDb({ seed: false })
await db.exec(`CREATE TABLE chunks (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, doc_id text NOT NULL, seq integer NOT NULL,
  heading_path text[] NOT NULL DEFAULT '{}', content text NOT NULL, embedding vector(64) NOT NULL, UNIQUE (doc_id, seq));
  CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);`)
await db.exec(TRGM_INDEX_SQL)
// 只放店家自己寫的文件（trust: official）；簡化的切塊：每個 ## 小節一塊
for (const doc of DOCS.filter(d => d.trust === 'official')) {
  const sections = doc.markdown.split(/^## /m).slice(1)
  for (const [seq, s] of sections.entries()) {
    const [heading, ...body] = s.split('\n')
    const content = body.join('\n').trim()
    await db.query(`INSERT INTO chunks (doc_id, seq, heading_path, content, embedding) VALUES ($1, $2, $3, $4, $5::vector)`,
      [doc.id, seq, [doc.title, heading.trim()], content, toSql(toyEmbed(heading + content))])
  }
}

const client = new Anthropic({ timeout: 60_000 })

for (const question of ['SKU-0042 是什麼？要加多少錢？', '燕麥奶有沒有乳糖？我對堅果過敏可以喝嗎', '你們有賣珍珠奶茶嗎']) {
  const qv = toyEmbed(question)
  const hits = await hybridSearch(db, question, qv, 5)
  // 用 cosine 代替重排分數（正式環境換成 reranker 的 relevance_score）
  const ranked = hits
    .map(h => ({ id: h.id, headingPath: h.headingPath, content: h.content, score: cosine(qv, toyEmbed(h.headingPath.at(-1) + h.content)) }))
    .sort((a, b) => b.score - a.score)
  console.log('\n顧客：', question)
  console.log('候選：', ranked.map(r => `${r.headingPath.join(' › ')}（${r.score.toFixed(2)}）`).join('｜'))
  const result = await answerWithSources(client, question, ranked, { minScore: 0.2 })
  console.log('結果：', JSON.stringify(result, null, 2))
}
await db.close()
console.log(`\n模型 ${MODEL}：每次回答大約 1～3 千 token 輸入、幾百 token 輸出，以 $${PRICES[MODEL].input}／$${PRICES[MODEL].output} 每百萬 token 計，加上思考的 token，一次大約 0.01～0.05 美元`)
