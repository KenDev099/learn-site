// 練習 4：確認查詢用到 HNSW 索引；過濾條件很嚴格時仍拿到 k 筆
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'

export type Db = Pick<PGlite, 'query' | 'transaction'>
export type Hit = { docId: string; seq: number; content: string; score: number }

export async function explainUsesIndex(db: Db, queryVector: number[]): Promise<boolean> {
  throw new Error('TODO')
}

export async function searchFiltered(db: Db, queryVector: number[], opts: { k: number; docId: string }): Promise<Hit[]> {
  throw new Error('TODO')
}
