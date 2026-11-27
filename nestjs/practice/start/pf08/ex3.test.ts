// 練習 3：游標分頁用別的租戶的 ID 也不會洩漏資料
import { call, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

async function project(acc: Account, name: string) {
  const r = await call(t, 'POST', '/api/v1/projects', { token: acc.token, body: { name } })
  expect(r.status, `POST /api/v1/projects 要 201：${r.text.slice(0, 200)}`).toBe(201)
  return r.body.id as string
}

describe('練習 3：分頁游標', () => {
  it('limit=1 翻頁：每一頁都只有自己的 project，翻完剛好是自己的全部', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const mine = [await project(a, 'A1'), await project(a, 'A2')]
    await project(b, 'B1')
    const seen: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 5; i++) {
      const r = await call(t, 'GET', `/api/v1/projects?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token: a.token })
      expect(r.status, `GET /api/v1/projects?limit=1 要 200：${r.text.slice(0, 200)}`).toBe(200)
      seen.push(...r.body.items.map((p: { id: string }) => p.id))
      cursor = r.body.nextCursor
      if (!cursor) break
    }
    expect(seen, '翻完所有頁要剛好是 A 的兩個 project（依建立時間由舊到新），不多不少').toEqual(mine)
  })

  it('游標指到 B 的 project：A 拿到的仍然只有自己的資料', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    await project(a, 'A1')
    const pb = await project(b, 'B1')
    // 參考實作的游標是 base64url(JSON [createdAt, id])；你的格式不同的話，這個游標會被當成壞掉的游標（400 也算過）
    const cursor = Buffer.from(JSON.stringify(['1970-01-01T00:00:00.000Z', pb])).toString('base64url')
    const r = await call(t, 'GET', `/api/v1/projects?cursor=${cursor}`, { token: a.token })
    const leaked = JSON.stringify(r.body ?? '').includes(pb) || /B1/.test(r.text)
    expect(leaked, `用 B 的 id 當游標，回應裡出現了 B 的資料：${r.text.slice(0, 200)}。游標只決定從哪裡開始，查詢一樣要有 tenantId 條件（手寫的 $queryRaw 不會經過 extension）`).toBe(false)
  })
})
