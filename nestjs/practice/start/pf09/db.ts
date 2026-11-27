// 第 9 課的灰箱測試共用：用 work/portfolio.json 的 saas.appDatabaseUrl（應用程式執行時的資料庫角色）直連
import pg from 'pg'
import type { Target } from '../../helpers/portfolio.ts'

export async function appDb(t: Target) {
  if (!t.appDatabaseUrl) throw new Error('work/portfolio.json 的 saas.appDatabaseUrl 沒有填：填應用程式執行時用的資料庫連線字串（app_user 那一組，不是跑 migration 的擁有者）')
  const db = new pg.Client({ connectionString: t.appDatabaseUrl, connectionTimeoutMillis: 5000 })
  try {
    await db.connect()
  } catch (e) {
    throw new Error(`用 saas.appDatabaseUrl 連不上資料庫：${(e as Error).message}`)
  }
  return db
}

// 有 tenant_id 欄位的資料表
export async function tenantTables(db: pg.Client) {
  const { rows } = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owner: string }>(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND a.attname = 'tenant_id' AND NOT a.attisdropped
    ORDER BY c.relname`)
  return rows
}
