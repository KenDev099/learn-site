// 練習 1：應用程式用的資料庫角色不能繞過 RLS
import { call, signupTenant, target } from '../../helpers/portfolio.ts'
import { appDb, tenantTables } from './db.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 1：兩個資料庫角色', () => {
  it('appDatabaseUrl 的角色不是 superuser、沒有 BYPASSRLS、不是有 tenant_id 的表的擁有者', async () => {
    const db = await appDb(t)
    try {
      const role = (await db.query('SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0]
      expect(role.rolsuper, `${role.name} 是 superuser：superuser 永遠不受 RLS 限制，應用程式要用另一個一般角色連線`).toBe(false)
      expect(role.rolbypassrls, `${role.name} 有 BYPASSRLS：這個屬性會跳過所有 policy`).toBe(false)
      const tables = await tenantTables(db)
      expect(tables.length, '資料庫裡找不到有 tenant_id 欄位的表：appDatabaseUrl 連到的資料庫對嗎？').toBeGreaterThan(0)
      const owned = tables.filter(r => r.owner === role.name).map(r => r.relname)
      expect(owned, `${role.name} 是這些表的擁有者：擁有者能 ALTER TABLE … DISABLE ROW LEVEL SECURITY。表由跑 migration 的角色擁有，應用程式只拿到 GRANT 的權限`).toEqual([])
    } finally {
      await db.end()
    }
  })

  it('API 實際連資料庫用的就是 appDatabaseUrl 的角色（pg_stat_activity 裡沒有別的角色）', async () => {
    const a = await signupTenant(t)
    await call(t, 'GET', '/api/v1/projects', { token: a.token })   // 讓 API 的連線池留著閒置連線
    const db = await appDb(t)
    try {
      const me = (await db.query('SELECT current_user AS name')).rows[0].name
      const { rows } = await db.query<{ usename: string; n: number }>(`
        SELECT usename, count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND usename IS NOT NULL
        GROUP BY usename`)
      expect(rows.length, '在 pg_stat_activity 找不到 API 的連線：appDatabaseUrl 跟 API 連的是同一個資料庫嗎？').toBeGreaterThan(0)
      const others = rows.filter(r => r.usename !== me).map(r => `${r.usename}（${r.n} 條）`)
      expect(others, `除了 ${me}，還有別的角色連著這個資料庫：API 的 DATABASE_URL 是不是還在用擁有者？（如果是你自己開著 psql 或 Prisma Studio，先關掉再跑）`).toEqual([])
    } finally {
      await db.end()
    }
  })
})
