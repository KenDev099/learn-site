// 練習 7：安全設定（OWASP API8：錯誤訊息、CORS、安全標頭）
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CustomersService } from './src/customers/customers.service.js'
import { bearer, login, makeApp, seed, U } from './test-fixtures.ts'

const SHOP = 'https://shop.coffee.example'
const POS = 'https://pos.coffee.example'
const corsOrigins = process.env.CORS_ORIGINS
let ctx: Awaited<ReturnType<typeof makeApp>>
let manager: string
beforeAll(async () => {
  // 允許的來源要從設定讀：測試把 CORS_ORIGINS 換成兩個來源，寫死在程式裡的會漏掉 POS
  process.env.CORS_ORIGINS = `${SHOP},${POS}`
  // 讓顧客名單丟出一個帶著內部細節的錯誤，模擬資料庫連不上
  ctx = await makeApp(b => b.overrideProvider(CustomersService).useValue({
    list: async () => { throw new Error('connect ECONNREFUSED 10.0.3.7:5432 (user=cafe_app password=hunter2)') },
  }))
  await seed(ctx.prisma)
  manager = (await login(ctx.app, U.manager1)).access
})
afterAll(async () => {
  process.env.CORS_ORIGINS = corsOrigins
  await ctx?.app.close()
})

describe('練習 7：錯誤回應、CORS、安全標頭', () => {
  it('功能：新增不重複的商品照常成功', async () => {
    const res = await ctx.http().post('/products').set(bearer(manager)).send({ name: '燕麥拿鐵', price: 130 })
    expect(res.status).toBe(201)
  })

  it('攻擊：重複的商品名稱 → 409，回應不帶 Prisma 的錯誤訊息、資料表名稱與 stack', async () => {
    const res = await ctx.http().post('/products').set(bearer(manager)).send({ name: '拿鐵', price: 120 })
    expect(res.status, '唯一鍵衝突（P2002）照樣回 409，前台才知道是名稱重複').toBe(409)
    const text = JSON.stringify(res.body)
    expect(text, '409 的回應不能帶 Prisma 的原始訊息、資料表或欄位名稱、stack：用自己寫的固定訊息')
      .not.toMatch(/Unique constraint|prisma|products|tenant_id|stack|\.ts:\d+/i)
  })

  it('攻擊：沒預期到的錯誤 → 500，只給 requestId，不帶任何內部細節', async () => {
    const res = await ctx.http().get('/stores/1/customers').set(bearer(manager))
    expect(res.status).toBe(500)
    const text = JSON.stringify(res.body)
    expect(text, '500 的回應不能帶錯誤訊息裡的 IP、帳號、密碼、stack').not.toMatch(/ECONNREFUSED|10\.0\.3\.7|hunter2|cafe_app|stack/)
    expect(typeof res.body.requestId === 'string' && res.body.requestId.length >= 8,
      '500 的回應要有 requestId（字串）：使用者回報時，客服用它在 log 找到完整的錯誤').toBe(true)
  })

  it('功能：已知的錯誤（HttpException）照常回應', async () => {
    const res = await ctx.http().patch('/me').set(bearer(manager)).send({ phone: '12345' })
    expect(res.status, '驗證失敗仍是 400').toBe(400)
    expect(res.body.message, 'ValidationPipe 的訊息要原樣保留').toContain('手機格式是 09 開頭的 10 位數字')
    expect((await ctx.http().get('/stores/1/orders/999').set(bearer(manager))).body, '404 也照常').toMatchObject({ statusCode: 404 })
  })

  it('攻擊：來自 https://evil.example 的 CORS 預檢 → 不給 Access-Control-Allow-Origin', async () => {
    const res = await ctx.http().options('/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET')
    expect(res.headers['access-control-allow-origin'], 'CORS 只能允許 CORS_ORIGINS 裡的來源，不能反射任何 Origin（origin: true）').toBeUndefined()
  })

  it('功能：前台的來源可以帶 credentials 呼叫', async () => {
    const res = await ctx.http().options('/me').set('Origin', SHOP).set('Access-Control-Request-Method', 'GET')
    expect(res.headers['access-control-allow-origin'], `允許的來源要剛好回 ${SHOP}`).toBe(SHOP)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers.vary, '依 Origin 決定回應時要有 Vary: Origin，快取才不會把 A 的回應給 B').toMatch(/Origin/i)
    const pos = await ctx.http().options('/me').set('Origin', POS).set('Access-Control-Request-Method', 'GET')
    expect(pos.headers['access-control-allow-origin'], `CORS_ORIGINS 設成「${SHOP},${POS}」時 ${POS} 也要允許：用 ConfigService 讀 CORS_ORIGINS、用逗號切開，不要把網址寫死在程式裡`).toBe(POS)
  })

  it('攻擊：回應要有安全標頭，不透露框架', async () => {
    const res = await ctx.http().get('/me').set(bearer(manager))
    expect(res.headers['x-content-type-options'], '用 helmet 加上安全標頭：X-Content-Type-Options: nosniff').toBe('nosniff')
    expect(res.headers['strict-transport-security'], 'helmet 預設的 Strict-Transport-Security').toBeDefined()
    expect(res.headers['x-powered-by'], 'X-Powered-By: Express 會告訴攻擊者用了什麼框架，helmet 會拿掉').toBeUndefined()
  })
})
