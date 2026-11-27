// 練習 2：混合搜尋：向量一路＋關鍵字（pg_trgm）一路，用練習 1 的 rrf 合併
// chunks 表跟第 9 課一樣：id、doc_id、seq、heading_path text[]、content、embedding vector(64)…，已經有 HNSW 索引
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'
import { rrf } from './ex1.ts'

export const CANDIDATES = 20        // 每一路各取前 20 名再合併
export const KEYWORD_THRESHOLD = 0.1

// 向量那一路（第 9 課教過，已經寫好）：$1 是查詢向量、$2 是筆數
export const VECTOR_SQL = `SELECT id::text AS id FROM chunks ORDER BY embedding <=> $1::vector LIMIT $2`

// 在 chunks.content 建 pg_trgm 的 GIN 索引（測試會先執行這句）
export const TRGM_INDEX_SQL = `CREATE INDEX chunks_content_trgm ON chunks USING gin (content gin_trgm_ops)`

// 關鍵字那一路：$1 是顧客的問題、$2 是筆數，回傳欄位 id（文字）
// <% 用的門檻是 pg_trgm.word_similarity_threshold；寫成運算子 GIN 索引才用得到，寫成 word_similarity(…) > 0.1 用不到
export const KEYWORD_SQL = `SELECT id::text AS id FROM chunks
WHERE $1 <% content
ORDER BY word_similarity($1, content) DESC, id
LIMIT $2`

export type Hit = {
  id: string
  docId: string
  headingPath: string[]
  content: string
  score: number                   // RRF 分數
  vectorRank: number | null       // 在向量那一路的名次（1 開始），沒出現是 null
  keywordRank: number | null      // 在關鍵字那一路的名次，沒出現是 null
}

// 兩路各取 CANDIDATES 筆，用 rrf 合併後取前 k 筆，補上 doc_id、heading_path、content
// 門檻：pg_trgm.word_similarity_threshold 要是 KEYWORD_THRESHOLD，但只能影響這一次查詢（不能改到整個連線）
export async function hybridSearch(db: PGlite, query: string, queryVector: number[], k: number): Promise<Hit[]> {
  // 錯誤寫法：把兩路的原始分數（1 - 距離、word_similarity）直接相加
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL pg_trgm.word_similarity_threshold = ${KEYWORD_THRESHOLD}`)
    const vector = (await tx.query<{ id: string; s: number }>(`SELECT id::text AS id, 1 - (embedding <=> $1::vector) AS s FROM chunks ORDER BY embedding <=> $1::vector LIMIT $2`, [toSql(queryVector), CANDIDATES])).rows
    const keyword = (await tx.query<{ id: string; s: number }>(`SELECT id::text AS id, word_similarity($1, content) AS s FROM chunks WHERE $1 <% content ORDER BY s DESC, id LIMIT $2`, [query, CANDIDATES])).rows
    const scores = new Map<string, number>()
    for (const r of [...vector, ...keyword]) scores.set(r.id, (scores.get(r.id) ?? 0) + Number(r.s))
    const fused = [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score).slice(0, k)
    void rrf
    const rows = (await tx.query<{ id: string; doc_id: string; heading_path: string[]; content: string }>(
      `SELECT id::text AS id, doc_id, heading_path, content FROM chunks WHERE id::text = ANY($1)`, [fused.map(f => f.id)])).rows
    const byId = new Map(rows.map(r => [r.id, r]))
    const rank = (list: { id: string }[], id: string) => { const i = list.findIndex(r => r.id === id); return i === -1 ? null : i + 1 }
    return fused.map(f => {
      const row = byId.get(f.id)!
      return { id: f.id, docId: row.doc_id, headingPath: row.heading_path, content: row.content, score: f.score, vectorRank: rank(vector, f.id), keywordRank: rank(keyword, f.id) }
    })
  })
}
