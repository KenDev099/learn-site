// 練習 2：每張有 tenant_id 的表都 ENABLE＋FORCE ROW LEVEL SECURITY
import { target } from '../../helpers/portfolio.ts'
import { appDb, tenantTables } from './db.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：RLS 開在每張租戶資料表', () => {
  it('每張有 tenant_id 的表 relrowsecurity 與 relforcerowsecurity 都是 true', async () => {
    const db = await appDb(t)
    try {
      const tables = await tenantTables(db)
      expect(tables.length, '找不到有 tenant_id 欄位的表').toBeGreaterThan(0)
      const off = tables.filter(r => !r.relrowsecurity).map(r => r.relname)
      const noForce = tables.filter(r => r.relrowsecurity && !r.relforcerowsecurity).map(r => r.relname)
      expect(off, `這些表沒開 RLS：migration 加 ALTER TABLE "<表>" ENABLE ROW LEVEL SECURITY 與 policy`).toEqual([])
      expect(noForce, `這些表開了 RLS 但沒有 FORCE：表的擁有者不受 policy 限制（哪天有人用擁有者跑腳本就全看得到），加 ALTER TABLE "<表>" FORCE ROW LEVEL SECURITY`).toEqual([])
    } finally {
      await db.end()
    }
  })
})
