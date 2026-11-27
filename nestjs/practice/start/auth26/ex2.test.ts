// 練習 2：欄位層級授權（OWASP API3：mass assignment 與回傳過多資料）
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bearer, login, makeApp, seed, U } from './test-fixtures.ts'

let ctx: Awaited<ReturnType<typeof makeApp>>
let wang: string, barista: string
beforeAll(async () => { ctx = await makeApp() })
beforeEach(async () => {
  await seed(ctx.prisma)
  wang = (await login(ctx.app, U.wang)).access
  barista = (await login(ctx.app, U.barista1)).access
})
afterAll(() => ctx?.app.close())

const ME_KEYS = ['email', 'id', 'name', 'phone', 'points', 'role']
const keys = (o: object) => Object.keys(o).sort()

describe('練習 2：顧客不能改不該改的欄位，回應只有規定的欄位', () => {
  it('攻擊：PATCH /me 夾帶 role、points、tenantId → 400，資料庫不變', async () => {
    for (const extra of [{ role: 'manager' }, { points: 99999 }, { tenantId: 2 }]) {
      const res = await ctx.http().patch('/me').set(bearer(wang)).send({ name: '王大明', ...extra })
      expect(res.status, `帶了 ${JSON.stringify(extra)} 要回 400：多餘的欄位要直接拒絕（forbidNonWhitelisted），不是悄悄丟掉`).toBe(400)
    }
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { email: U.wang } })
    expect({ name: row.name, role: row.role, points: row.points, tenantId: row.tenantId }, '被拒絕的請求不能改到資料庫的任何欄位')
      .toEqual({ name: '王小明', role: 'customer', points: 120, tenantId: 1 })
  })

  it('功能：PATCH /me 改名字與手機 → 200，回應只有規定的欄位', async () => {
    const res = await ctx.http().patch('/me').set(bearer(wang)).send({ name: '王大明', phone: '0911222333' })
    expect(res.status, '只帶 name、phone 要成功').toBe(200)
    expect(keys(res.body), `PATCH /me 的回應只能有 ${ME_KEYS.join('、')}：不要把整筆 User 回傳（裡面有 passwordHash、mfaSecret）`).toEqual(ME_KEYS)
    expect(res.body).toMatchObject({ name: '王大明', phone: '0911222333', role: 'customer', points: 120 })
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { email: U.wang } })
    expect(row.phone).toBe('0911222333')
  })

  it('功能：GET /me 只有規定的欄位，自己看得到完整手機', async () => {
    const res = await ctx.http().get('/me').set(bearer(wang))
    expect(res.status).toBe(200)
    expect(keys(res.body), `GET /me 的回應只能有 ${ME_KEYS.join('、')}`).toEqual(ME_KEYS)
    expect(res.body.phone, '自己的資料看得到完整手機').toBe('0912345678')
  })

  it('攻擊：店員看門市顧客名單 → 沒有 passwordHash、mfaSecret，手機要遮罩', async () => {
    const res = await ctx.http().get('/stores/1/customers').set(bearer(barista))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(keys(res.body[0]), '顧客名單每一筆只能有 id、name、phone、points').toEqual(['id', 'name', 'phone', 'points'])
    expect(res.body[0], '手機遮罩成前 4 碼＋***＋後 3 碼，例如 0912***678').toEqual({ id: 6, name: '王小明', phone: '0912***678', points: 120 })
  })
})
