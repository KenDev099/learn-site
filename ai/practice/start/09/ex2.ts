// 練習 2：把一份文件的塊寫進 chunks，只替內容有變的塊重算 embedding
import { createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'

export type Db = Pick<PGlite, 'query' | 'transaction'>
export type ChunkInput = { seq: number; headingPath: string[]; content: string }
export type Embed = (texts: string[]) => Promise<number[][]>

// 已經寫好，不用改：送去 embedding 的文字（標題路徑＋內容），以及它的雜湊值
export const embedText = (c: ChunkInput) => `${c.headingPath.join(' › ')}\n${c.content}`
export const contentHash = (text: string) => createHash('sha256').update(text).digest('hex')

export async function upsertDoc(db: Db, docId: string, chunks: ChunkInput[], embed: Embed, model: string): Promise<{ embedded: number; deleted: number }> {
  throw new Error('TODO')
}
