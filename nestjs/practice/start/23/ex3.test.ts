// 練習 3：URI 版本。舊的 /menu 與 /v1/menu 一個字都不改並標示淘汰，/v2/menu 是新的形狀
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { ProductsService } from './src/products/products.service.js'

const V1 = [
  { id: 1, name: '美式咖啡', price: 80, category: 'coffee' },
  { id: 2, name: '拿鐵', price: 110, category: 'coffee' },
  { id: 3, name: '卡布奇諾', price: 110, category: 'coffee' },
  { id: 4, name: '伯爵紅茶', price: 90, category: 'tea' },
  { id: 5, name: '可頌', price: 70, category: 'food' },
  { id: 6, name: '起司蛋糕', price: 120, category: 'food' },
]
const V2 = [
  { category: 'coffee', items: [{ id: 1, name: '美式咖啡', price: 80 }, { id: 2, name: '拿鐵', price: 110 }, { id: 3, name: '卡布奇諾', price: 110 }] },
  { category: 'tea', items: [{ id: 4, name: '伯爵紅茶', price: 90 }] },
  { category: 'food', items: [{ id: 5, name: '可頌', price: 70 }, { id: 6, name: '起司蛋糕', price: 120 }] },
]

describe('練習 3：推出 v2，v1 標示淘汰', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule, { configure: configureApp }) })
  afterAll(() => app?.close())
  const http = () => request(app.getHttpServer())

  it('GET /v1/menu 的形狀跟原本的 GET /menu 完全一樣', async () => {
    const res = await http().get('/v1/menu')
    expect(res.status, "GET /v1/menu 要 200：configureApp 裡 app.enableVersioning({ type: VersioningType.URI })，舊的 handler 加上版本 '1'").toBe(200)
    expect(res.body, 'v1 的回應不能改：還在用的 iOS App 會壞。新形狀放在 v2').toEqual(V1)
  })

  it('舊網址 GET /menu 照樣回 v1：加版本這件事本身不能弄壞現有客戶端', async () => {
    const res = await http().get('/menu')
    expect(res.status, "GET /menu 要 200：已經上架的 App 還在打 /menu，拿掉它就是刪掉端點。舊的 handler 用 @Version([VERSION_NEUTRAL, '1'])").toBe(200)
    expect(res.body, 'GET /menu 跟 /v1/menu 一樣是舊形狀').toEqual(V1)
  })

  it.each(['/menu', '/v1/menu'])('GET %s 帶 Deprecation 與 Sunset 標頭', async path => {
    const res = await http().get(path)
    const deprecation = res.headers.deprecation
    expect(deprecation, "舊版要有 Deprecation 標頭，例如 @Header('Deprecation', '@1798761600')").toBeDefined()
    expect(deprecation, 'Deprecation 的值是 RFC 9745 的日期：@ 加上 Unix 秒數，例如 @1798761600（舊草稿的 true 已經不是標準）').toMatch(/^@\d+$/)
    const sunset = res.headers.sunset
    expect(sunset, "舊版要有 Sunset 標頭，例如 @Header('Sunset', 'Thu, 01 Jul 2027 00:00:00 GMT')").toBeDefined()
    const sunsetAt = Date.parse(sunset)
    expect(Number.isNaN(sunsetAt) || !/GMT$/.test(sunset), 'Sunset 是 HTTP 日期（RFC 8594），例如 Thu, 01 Jul 2027 00:00:00 GMT').toBe(false)
    expect(sunsetAt, 'Sunset（停止服務）不能早於 Deprecation（開始淘汰）').toBeGreaterThanOrEqual(Number(deprecation.slice(1)) * 1000)
  })

  it('GET /v2/menu 依分類分組，沒有淘汰標頭', async () => {
    const res = await http().get('/v2/menu')
    expect(res.status, "GET /v2/menu 要 200：新的 handler 加 @Version('2')").toBe(200)
    expect(res.body, 'v2 是 [{ category, items: [{ id, name, price }] }]，分類照第一次出現的順序').toEqual(V2)
    expect(res.headers.deprecation, 'v2 是新版，不能帶 Deprecation').toBeUndefined()
    expect(res.headers.sunset, 'v2 是新版，不能帶 Sunset').toBeUndefined()
  })

  it('v1、v2 都是從 ProductsService 算出來的，不是寫死', async () => {
    const other = await createTestApp(AppModule, {
      configure: configureApp,
      override: b => b.overrideProvider(ProductsService).useValue({
        list: () => [
          { id: 9, name: '冰滴', price: 150, category: 'coffee', stock: 1 },
          { id: 7, name: '抹茶', price: 100, category: 'tea', stock: 1 },
          { id: 8, name: '紅茶', price: 60, category: 'tea', stock: 1 },
        ],
        find: () => undefined,
      }),
    })
    try {
      const res = await request(other.getHttpServer()).get('/v2/menu')
      expect(res.body, '換一組商品，v2 也要正確分組（用注入的 this.products）').toEqual([
        { category: 'coffee', items: [{ id: 9, name: '冰滴', price: 150 }] },
        { category: 'tea', items: [{ id: 7, name: '抹茶', price: 100 }, { id: 8, name: '紅茶', price: 60 }] },
      ])
      const v1 = await request(other.getHttpServer()).get('/v1/menu')
      expect(v1.body, '換一組商品，v1 也要跟著變：舊的 handler 照原本的寫法用 this.products 算，不要寫死回應').toEqual([
        { id: 9, name: '冰滴', price: 150, category: 'coffee' },
        { id: 7, name: '抹茶', price: 100, category: 'tea' },
        { id: 8, name: '紅茶', price: 60, category: 'tea' },
      ])
    } finally {
      await other.close()
    }
  })

  it('其他沒標版本的路由網址不變：POST /orders 照樣 201，/v1/orders 不存在', async () => {
    const order = await http().post('/orders').send({ customerId: 1, items: [{ productId: 1, qty: 1, size: 'M' }] })
    expect(order.status, 'POST /orders 要照樣 201：不要設 defaultVersion，它會把所有沒寫版本的路由搬到 /v1/…，舊網址全部 404').toBe(201)
    expect((await http().post('/v1/orders').send({})).status, '/v1/orders 不能存在：只有 menu 有版本，其他路由不要加 @Version 或 defaultVersion').toBe(404)
    expect((await http().get('/v3/menu')).status, '沒有的版本要 404').toBe(404)
  })

  it('OpenAPI 文件把 v1 標成 deprecated', () => {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build())
    expect(doc.paths['/v2/menu']?.get, '文件裡要有 GET /v2/menu').toBeDefined()
    expect(doc.paths['/v1/menu']?.get?.deprecated, "GET /v1/menu 在文件裡要 deprecated: true：@ApiOperation({ deprecated: true })").toBe(true)
    expect(doc.paths['/menu']?.get?.deprecated, 'GET /menu 在文件裡也是 deprecated').toBe(true)
    expect(doc.paths['/v2/menu']?.get?.deprecated, 'v2 不是 deprecated').not.toBe(true)
  })
})
