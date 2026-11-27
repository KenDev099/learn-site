// 記憶體裡的 PostgreSQL（PGlite 0.5.13 = PostgreSQL 18.6）加 pgvector 0.8.7 與 pg_trgm
// 每個測試自己開一個、用完 close()：資料完全隔離，不需要 Docker，也不開 port
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { COFFEE_SQL } from './coffee.ts'

// seed：true（預設）先建咖啡店的四張表；false 不建；字串則在咖啡店資料之後再執行這段 SQL
export async function openVectorDb({ seed = true }: { seed?: boolean | string } = {}) {
  const db = await PGlite.create({ extensions: { vector, pg_trgm } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;')
  if (seed !== false) await db.exec(COFFEE_SQL)
  if (typeof seed === 'string') await db.exec(seed)
  return db
}
export type VectorDb = PGlite

// 向量轉成 pgvector 的文字格式 '[0.1,0.2,…]'，當成 SQL 參數傳：db.query('… $1::vector', [toSql(v)])
export const toSql = (v: number[]) => `[${v.join(',')}]`
