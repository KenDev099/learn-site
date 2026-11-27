// 練習 2：混合搜尋（向量＋pg_trgm，用 RRF 合併），只搜 trust 是 official 的文件
import type { PGlite } from '@electric-sql/pglite'
import { toSql } from '../../helpers/pg.ts'
import { rrf } from './kit.ts'
import type { Embed, Ranked } from './kit.ts'

export const TOP_K = 5
export const CANDIDATES = 20        // 每一路各取前 20 名再合併
export const MIN_SIMILARITY = 0.3   // 向量那一路：cosine 相似度（1 - 距離）低於這個就不要
export const KEYWORD_THRESHOLD = 0.1

// 規則：
// 1. 用 embed([question]) 算出問題的向量
// 2. 在 db.transaction 裡：SET LOCAL pg_trgm.word_similarity_threshold = KEYWORD_THRESHOLD
// 3. 向量那一路：相似度 >= MIN_SIMILARITY 的塊，依距離由近到遠取 CANDIDATES 筆
//    關鍵字那一路：$1 <% content 的塊，依 word_similarity 由高到低（同分依 id）取 CANDIDATES 筆
//    兩路都只能找 docs.trust = 'official' 的文件（JOIN docs），條件寫在 SQL 裡，不是查完再過濾
// 4. rrf([向量, 關鍵字]) 取前 TOP_K，補上 doc_id、heading_path、content；score 是 RRF 分數
// 兩路都沒有結果時回傳空陣列（第 3 題用它決定要不要直接轉店員）
export async function retrieve(db: PGlite, question: string, embed: Embed): Promise<Ranked[]> {
  throw new Error('TODO')
}
