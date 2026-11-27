// 練習 3：top-k 向量搜尋
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'

export type Db = Pick<PGlite, 'query'>
export type Hit = { docId: string; seq: number; content: string; score: number }
export type SearchOptions = { k: number; docIds?: string[]; minScore?: number }

export async function search(db: Db, queryVector: number[], opts: SearchOptions): Promise<Hit[]> {
  throw new Error('TODO')
}
