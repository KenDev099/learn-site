// 練習 4：確認查詢用到 HNSW 索引；過濾條件很嚴格時仍拿到 k 筆
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'

export type Db = Pick<PGlite, 'query' | 'transaction'>
export type Hit = { docId: string; seq: number; content: string; score: number }

export async function explainUsesIndex(db: Db, queryVector: number[]): Promise<boolean> {
  return db.transaction(async tx => {
    await tx.query('SET LOCAL enable_seqscan = off')
    const { rows } = await tx.query<{ 'QUERY PLAN': string }>(
      'EXPLAIN SELECT id FROM chunks ORDER BY embedding <=> $1::vector LIMIT 5', [toSql(queryVector)])
    return rows.some(r => /Index Scan using \S+ on chunks/.test(r['QUERY PLAN']))
  })
}

export async function searchFiltered(db: Db, queryVector: number[], opts: { k: number; docId: string }): Promise<Hit[]> {
  return db.transaction(async tx => {
    await tx.query('SET LOCAL hnsw.iterative_scan = relaxed_order')
    const { rows } = await tx.query<Hit>(
      `WITH hits AS MATERIALIZED (
         SELECT doc_id, seq, content, embedding <=> $1::vector AS distance
         FROM chunks
         WHERE doc_id = $2
         ORDER BY distance
         LIMIT $3
       )
       SELECT doc_id AS "docId", seq, content, 1 - distance AS score FROM hits ORDER BY distance + 0`,
      [toSql(queryVector), opts.docId, opts.k])
    return rows
  })
}
