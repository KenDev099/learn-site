// 練習 3：top-k 向量搜尋
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'

export type Db = Pick<PGlite, 'query'>
export type Hit = { docId: string; seq: number; content: string; score: number }
export type SearchOptions = { k: number; docIds?: string[]; minScore?: number }

export async function search(db: Db, queryVector: number[], opts: SearchOptions): Promise<Hit[]> {
  const { rows } = await db.query<Hit>(
    `SELECT doc_id AS "docId", seq, content, 1 - (embedding <=> $1::vector) AS score
     FROM chunks
     WHERE ($2::text[] IS NULL OR doc_id = ANY($2::text[]))
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [toSql(queryVector), opts.docIds ?? null, opts.k])
  return opts.minScore ? rows.filter(r => r.score >= opts.minScore!) : rows
}
