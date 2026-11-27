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
  throw new Error('TODO')
}
