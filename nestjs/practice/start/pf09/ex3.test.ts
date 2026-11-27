// 練習 3：policy 真的有效：沒設上下文看不到、設了只看得到自己、寫不進別的租戶；連線池不會帶著上一個請求的租戶
import { randomUUID } from 'node:crypto'
import { call, concurrent, signupTenant, target, type Account } from '../../helpers/portfolio.ts'
import { appDb } from './db.ts'

const t = await target(import.meta.dirname, 'saas')

async function project(acc: Account, name: string) {
  const r = await call(t, 'POST', '/api/v1/projects', { token: acc.token, body: { name } })
  expect(r.status, `POST /api/v1/projects 要 201：${r.text.slice(0, 200)}`).toBe(201)
  return r.body.id as string
}

describe('練習 3：policy 與 set_config', () => {
  it('沒設 app.tenant_id：projects 一列都看不到；交易裡設成 A：只看到 A 的；寫入 B 的列被擋', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    await project(a, 'A 的專案')
    await project(b, 'B 的專案')
    const db = await appDb(t)
    try {
      const count = async () => Number((await db.query('SELECT count(*) FROM projects')).rows[0].count)
      expect(await count(), '沒設 app.tenant_id 就查得到 projects：policy 要寫 NULLIF(current_setting(\'app.tenant_id\', true), \'\')::uuid，沒設定時條件是 NULL、一列都不符合').toBe(0)
      await db.query('BEGIN')
      try {
        await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.tenantId])
        const { rows } = await db.query<{ tenant_id: string }>('SELECT DISTINCT tenant_id FROM projects')
        expect(rows.map(r => r.tenant_id), 'app.tenant_id 設成 A 之後，只能看到 A 的 project').toEqual([a.tenantId])
        const insert = await db.query(`INSERT INTO projects (id, tenant_id, name, updated_at) VALUES ($1, $2, '偷渡', now())`, [randomUUID(), b.tenantId]).then(() => null, (e: Error) => e)
        expect(insert?.message ?? '寫入成功了', 'app.tenant_id 是 A 的時候，寫入 tenant_id = B 的列要被 policy 擋下（WITH CHECK 要跟 USING 一樣嚴格）').toMatch(/row-level security/)
      } finally {
        await db.query('ROLLBACK')
      }
    } finally {
      await db.end()
    }
  })

  it('200 個 A、B 交錯的請求（同時 20 個）：每個都只看到自己的那一筆', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const pa = await project(a, 'A'), pb = await project(b, 'B')
    const bad: string[] = []
    await concurrent(20, 200, async i => {
      const [acc, own, who] = i % 2 ? [a, pa, 'A'] : [b, pb, 'B']
      const r = await call(t, 'GET', '/api/v1/projects', { token: acc.token })
      const got = (r.body?.items ?? []).map((p: { id: string }) => p.id)
      if (r.status !== 200 || got.length !== 1 || got[0] !== own) bad.push(`${who}：${r.status} ${JSON.stringify(got)}`)
    })
    expect(bad.slice(0, 5), `${bad.length} 個請求看到的不是自己的那一筆：set_config 要跟查詢在同一個交易、用 is_local = true；分成兩句、或用 false（session 層級），連線池會把設定留給下一個請求`).toEqual([])
  })
})
