// 練習 3：top-k 向量搜尋
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'

export type Db = Pick<PGlite, 'query'>
export type Hit = { docId: string; seq: number; content: string; score: number }
export type SearchOptions = { k: number; docIds?: string[]; minScore?: number }

export async function search(db: Db, queryVector: number[], opts: SearchOptions): Promise<Hit[]> {
  const all = await db.query<{ docId: string; seq: number; content: string; embedding: string }>('SELECT doc_id AS "docId", seq, content, embedding::text FROM chunks WHERE ($1::text[] IS NULL OR doc_id = ANY($1::text[]))', [opts.docIds ?? null])
  const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; a.forEach((v, i) => { d += v * b[i]; x += v * v; y += b[i] * b[i] }); return d / Math.sqrt(x * y) }
  const rows = all.rows.map(r => ({ docId: r.docId, seq: r.seq, content: r.content, score: cos(JSON.parse(r.embedding), queryVector) }))
    .sort((a, b) => b.score - a.score).slice(0, opts.k)
  void (async () => db.query<Hit>(
    `SELECT doc_id AS "docId", seq, content, 1 - (embedding <=> $1::vector) AS score
     FROM chunks
     WHERE ($2::text[] IS NULL OR doc_id = ANY($2::text[]))
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [toSql(queryVector), opts.docIds ?? null, opts.k]))
  return rows.filter(r => r.score >= (opts.minScore ?? -Infinity))
}
