// 測試共用的工具（已經寫好，不用改）：建資料表、產生固定的亂數向量、一次寫入很多筆
import { readFileSync } from 'node:fs'
import { openVectorDb, toSql, type VectorDb } from '../../helpers/pg.ts'
import { mulberry32 } from '../../helpers/clock.ts'

// 開一個全新的記憶體資料庫，跑你在練習 1 寫的 ex1.sql
export async function openChunksDb(): Promise<VectorDb> {
  const db = await openVectorDb({ seed: false })
  await db.exec(readFileSync(new URL('./ex1.sql', import.meta.url), 'utf8'))
  return db
}

// 用固定 seed 產生 n 個 dim 維的向量（每次執行都一樣）；scale 讓長度不一樣，才分得出 cosine 與 L2
export function randomVectors(n: number, seed: number, dim = 64): number[][] {
  const random = mulberry32(seed)
  return Array.from({ length: n }, () => {
    const scale = 0.5 + random() * 4
    return Array.from({ length: dim }, () => (random() - 0.5) * scale)
  })
}

export type Row = { docId: string; seq: number; content: string; embedding: number[] }

// 一句 INSERT 寫入全部的列（unnest 把幾個陣列參數攤開成一列一列）
export async function insertRows(db: VectorDb, rows: Row[], model = 'toy-64') {
  await db.query(
    `INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model)
     SELECT d, s, '{}', c, md5(c), e::vector, $5 FROM unnest($1::text[], $2::int[], $3::text[], $4::text[]) AS t(d, s, c, e)`,
    [rows.map(r => r.docId), rows.map(r => r.seq), rows.map(r => r.content), rows.map(r => toSql(r.embedding)), model],
  )
}

// cosine 相似度（用來算「正確答案」）
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return dot / Math.sqrt(na * nb)
}
