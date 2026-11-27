// 練習 4（灰箱）：應用程式的資料庫角色不能改、不能刪稽核紀錄
import pg from 'pg'
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

async function withApp<T>(fn: (db: pg.Client) => Promise<T>) {
  expect(t.appDatabaseUrl, 'work/portfolio.json 的 saas.appDatabaseUrl 要填應用程式執行時用的資料庫連線字串（第 9 課的 app_user）').toBeTruthy()
  const db = new pg.Client({ connectionString: t.appDatabaseUrl })
  await db.connect()
  try { return await fn(db) } finally { await db.end() }
}

describe('練習 4：稽核表只能追加', () => {
  it('appDatabaseUrl 的角色對 audit_logs 可以 SELECT、INSERT，不能 UPDATE、DELETE、TRUNCATE', async () => {
    const p = await withApp(db => db.query(`SELECT has_table_privilege('audit_logs', 'SELECT') AS s, has_table_privilege('audit_logs', 'INSERT') AS i,
      has_any_column_privilege('audit_logs', 'UPDATE') AS u, has_table_privilege('audit_logs', 'DELETE') AS d, has_table_privilege('audit_logs', 'TRUNCATE') AS tr`))
    const r = p.rows[0]
    expect({ select: r.s, insert: r.i }, '應用程式要能寫入與查詢稽核表').toEqual({ select: true, insert: true })
    expect({ update: r.u, delete: r.d, truncate: r.tr }, '在 migration 裡 REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM <app 角色>').toEqual({ update: false, delete: false, truncate: false })
  })

  it('API 實際用的就是 appDatabaseUrl 的角色（不是擁有者）', async () => {
    const a = await signupTenant(t)   // 打過 API，連線池裡會留著閒置的連線
    expect((await call(t, 'GET', '/api/v1/audit-logs', { token: a.token })).status).toBe(200)
    const others = await withApp(async db => (await db.query(`SELECT DISTINCT usename FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND usename IS NOT NULL AND usename <> current_user`)).rows.map(r => r.usename))
    expect(others, `資料庫裡還有用 ${others.join('、')} 連著的連線：API 要用 appDatabaseUrl 的角色連線，權限收回才有意義。若是你自己開的 psql、Prisma Studio，先關掉再跑`).toEqual([])
  })
})
