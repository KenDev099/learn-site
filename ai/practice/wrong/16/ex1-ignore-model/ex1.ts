// 練習 1：把門市文件寫進 PGlite：文件一列、每塊一列；內容沒變的塊不重算 embedding
import type { PGlite } from '@electric-sql/pglite'
import type { Doc } from '../../helpers/coffee.ts'
import { toSql } from '../../helpers/pg.ts'
import { CHUNK_OPTS, chunkMarkdown, contentHash, EMBED_MODEL, embedText } from './kit.ts'
import type { Embed } from './kit.ts'

// 表已經建好（kit.ts 的 SCHEMA_SQL）。規則：
// 1. 每份文件 upsert 一列 docs（id、title、trust）；trust 改了也要更新
// 2. 用 chunkMarkdown(doc.id, doc.markdown, CHUNK_OPTS) 切塊
// 3. 跟資料庫現有的 content_hash、embed_model 比對：只挑新的、內容變了、或換了 EMBED_MODEL 的塊
//    （雜湊用 contentHash(embedText(chunk))；送去 embedding 的也是 embedText(chunk)）
// 4. 所有文件要重算的塊，一次批次呼叫 embed；沒有要重算的就不呼叫
// 5. 在同一個交易裡寫入（ON CONFLICT (doc_id, seq) DO UPDATE），並刪掉文件變短後多出來的舊塊
// 回傳這次 embedding 了幾塊、刪了幾塊
export async function ingest(db: PGlite, docs: Doc[], embed: Embed): Promise<{ embedded: number; deleted: number }> {
  const { rows } = await db.query<{ doc_id: string; seq: number; content_hash: string; embed_model: string }>(
    'SELECT doc_id, seq, content_hash, embed_model FROM chunks')
  const old = new Map(rows.map(r => [`${r.doc_id}:${r.seq}`, r]))

  const all = docs.map(doc => ({ doc, chunks: chunkMarkdown(doc.id, doc.markdown, CHUNK_OPTS) }))
  const changed = all.flatMap(({ chunks }) => chunks)
    .map(c => ({ ...c, hash: contentHash(embedText(c)) }))
    .filter(c => {
      const prev = old.get(`${c.docId}:${c.seq}`)
      return prev?.content_hash !== c.hash   // 錯：沒比對 embed_model
    })
  // 不在交易裡等外部 API：先算好向量再開交易
  const vectors = changed.length ? await embed(changed.map(embedText)) : []
  if (vectors.length !== changed.length) throw new Error(`embed 回傳 ${vectors.length} 個向量，預期 ${changed.length} 個`)

  return db.transaction(async tx => {
    for (const { doc } of all) {
      await tx.query(
        `INSERT INTO docs (id, title, trust) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, trust = EXCLUDED.trust`,
        [doc.id, doc.title, doc.trust])
    }
    for (const [i, c] of changed.entries()) {
      await tx.query(
        `INSERT INTO chunks (doc_id, seq, heading_path, content, content_hash, embedding, embed_model)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
         ON CONFLICT (doc_id, seq) DO UPDATE SET heading_path = EXCLUDED.heading_path, content = EXCLUDED.content,
           content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, embed_model = EXCLUDED.embed_model`,
        [c.docId, c.seq, c.headingPath, c.text, c.hash, toSql(vectors[i]), EMBED_MODEL])
    }
    let deleted = 0
    for (const { doc, chunks } of all) {
      const del = await tx.query('DELETE FROM chunks WHERE doc_id = $1 AND seq >= $2', [doc.id, chunks.length])
      deleted += del.affectedRows ?? 0
    }
    return { embedded: changed.length, deleted }
  })
}
