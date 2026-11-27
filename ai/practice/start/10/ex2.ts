// 練習 2：混合搜尋：向量一路＋關鍵字（pg_trgm）一路，用練習 1 的 rrf 合併
// chunks 表跟第 9 課一樣：id、doc_id、seq、heading_path text[]、content、embedding vector(64)…，已經有 HNSW 索引
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'
import { rrf } from './ex1.ts'

export const CANDIDATES = 20        // 每一路各取前 20 名再合併
export const KEYWORD_THRESHOLD = 0.1

// 向量那一路（第 9 課教過，已經寫好）：$1 是查詢向量、$2 是筆數
export const VECTOR_SQL = `SELECT id::text AS id FROM chunks ORDER BY embedding <=> $1::vector LIMIT $2`

// TODO：在 chunks.content 建 pg_trgm 的 GIN 索引（測試會先執行這句）
export const TRGM_INDEX_SQL = ``

// TODO：關鍵字那一路：$1 是顧客的問題、$2 是筆數，回傳欄位 id（文字）
// 用 word_similarity($1, content) 由高到低排序（同分依 id），只留超過門檻的；條件要寫成 GIN 索引用得到的形式
export const KEYWORD_SQL = ``

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
  throw new Error('TODO')
}
