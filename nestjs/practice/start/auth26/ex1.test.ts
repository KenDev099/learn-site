// 練習 1：物件層級授權與租戶隔離（OWASP API1）
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bearer, login, makeApp, seed, U } from './test-fixtures.ts'

let ctx: Awaited<ReturnType<typeof makeApp>>
const tokens: Record<string, string> = {}
beforeAll(async () => {
  ctx = await makeApp()
  await seed(ctx.prisma)
  for (const k of ['manager1', 'barista1', 'barista2'] as const) tokens[k] = (await login(ctx.app, U[k])).access
})
afterAll(() => ctx?.app.close())

const get = (who: string, path: string) => ctx.http().get(path).set(bearer(tokens[who]))

describe('練習 1：門市訂單只看得到自己範圍內的', () => {
  it('功能：店員看自己門市的訂單、店長看自己品牌每一間門市的訂單', async () => {
    const own = await get('barista1', '/stores/1/orders/1')
    expect(own.status, '信義店的店員看信義店的訂單 1 要 200：不要把正常的存取也擋掉').toBe(200)
    expect(own.body.id).toBe(1)
    const other = await get('manager1', '/stores/2/orders/3')
    expect(other.status, '豆香的店長看大安店的訂單 3 要 200：店長管整個品牌').toBe(200)
    const list = await get('barista1', '/stores/1/orders')
    expect(list.status).toBe(200)
    expect(list.body.map((o: { id: number }) => o.id), '信義店的訂單列表是 1、2').toEqual([1, 2])
  })

  it('攻擊：改路徑的 storeId 看別的品牌 → 404，而且回應跟不存在的訂單一模一樣', async () => {
    const missing = await get('manager1', '/stores/1/orders/999')
    const cross = await get('manager1', '/stores/3/orders/4')
    expect(cross.status, '豆香的店長看山嵐中山店的訂單要 404（不是 403：403 等於告訴對方這筆存在）').toBe(404)
    expect(cross.body, '跨租戶的回應要跟不存在的訂單完全相同，攻擊者才分不出來').toEqual(missing.body)
  })

  it('攻擊：路徑是自己的門市，orderId 卻是別間門市或別的品牌的 → 404', async () => {
    const r1 = await get('manager1', '/stores/1/orders/4')
    expect(r1.status, '/stores/1/orders/4：訂單 4 在山嵐中山店。查訂單時要同時比對 storeId，不能只看 orderId').toBe(404)
    const r2 = await get('barista1', '/stores/1/orders/3')
    expect(r2.status, '/stores/1/orders/3：訂單 3 在大安店，信義店的店員不能透過自己門市的路徑看到').toBe(404)
  })

  it('攻擊：店員看同品牌別間門市 → 404', async () => {
    const r = await get('barista1', '/stores/2/orders/3')
    expect(r.status, '信義店的店員只能看信義店，看大安店的訂單要 404').toBe(404)
  })

  it('攻擊：列表也要限制範圍（同一個錯誤不只一個端點）', async () => {
    expect((await get('manager1', '/stores/3/orders')).status, '豆香的店長列出山嵐中山店的訂單要 404').toBe(404)
    expect((await get('barista1', '/stores/2/orders')).status, '信義店的店員列出大安店的訂單要 404').toBe(404)
    const ok = await get('manager1', '/stores/2/orders')
    expect(ok.status).toBe(200)
    expect(ok.body.map((o: { id: number }) => o.id)).toEqual([3])
  })

  it('攻擊：門市顧客名單有同樣的問題，也要修', async () => {
    expect((await get('manager1', '/stores/3/customers')).status, 'GET /stores/3/customers：豆香的店長看山嵐門市的顧客要 404').toBe(404)
    expect((await get('barista1', '/stores/2/customers')).status, 'GET /stores/2/customers：信義店店員看大安店的顧客要 404').toBe(404)
    const ok = await get('barista1', '/stores/1/customers')
    expect(ok.status, '信義店店員看信義店的顧客要 200').toBe(200)
    expect(ok.body.map((c: { id: number }) => c.id)).toEqual([6])
  })
})
