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
  // 1. 讀出這份文件現有的雜湊與模型
  const { rows } = await db.query<{ seq: number; content_hash: string; embed_model: string }>(
    'SELECT seq, content_hash, embed_model FROM chunks WHERE doc_id = $1', [docId])
  const old = new Map(rows.map(r => [r.seq, r]))

  // 2. 只挑出新的、內容變了、或換了模型的塊，一次批次呼叫 embed（不在交易裡等外部 API）
  const changed = chunks
    .map(c => ({ ...c, text: embedText(c), hash: contentHash(embedText(c)) }))
    .filter(c => old.get(c.seq)?.content_hash !== c.hash || old.get(c.seq)?.embed_model !== model)
  const vectors = changed.length ? await embed(changed.map(c => c.text)) : []
  if (vectors.length !== changed.length) throw new Error(`embed 回傳 ${vectors.length} 個向量，預期 ${changed.length} 個`)

  // 3. 寫入與刪除放在同一個交易：中途失敗就全部回滾
  return db.transaction(async tx => {
    for (const [i, c] of changed.entries()) {
      await tx.query(
        `INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model)
         VALUES ($1, $2, $3, '${c.content}', $4, $5::vector, $6)
         ON CONFLICT (doc_id, seq) DO UPDATE SET
           heading_path = EXCLUDED.heading_path, content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
           embedding = EXCLUDED.embedding, embed_model = EXCLUDED.embed_model, updated_at = now()`,
        [docId, c.seq, c.headingPath, c.hash, toSql(vectors[i]), model])
    }
    const del = await tx.query('DELETE FROM chunks WHERE doc_id = $1 AND seq >= $2', [docId, chunks.length])
    return { embedded: changed.length, deleted: del.affectedRows ?? 0 }
  })
}
