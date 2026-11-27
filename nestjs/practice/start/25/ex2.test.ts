// 練習 2：StoreContext 改用 AsyncLocalStorage，整條鏈回到 singleton
import { Controller, Get, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { AppModule } = await import('./src/app.module.js')
const { StoreModule } = await import('./src/store/store.module.js')
const { StoreContext } = await import('./src/store/store-context.js')
const { ProductsService } = await import('./src/products/products.service.js')
const { OrdersService } = await import('./src/orders/orders.service.js')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 測試自己加的路由：await 前後各讀一次 storeId
@Controller('probe')
class ProbeController {
  constructor(private readonly store: InstanceType<typeof StoreContext>) {}

  @Get()
  async probe() {
    const before = this.store.storeId
    await sleep(60)
    return { before, after: this.store.storeId }
  }
}
Reflect.defineMetadata('design:paramtypes', [StoreContext], ProbeController)

describe('練習 2：用 AsyncLocalStorage 取代 request scope', () => {
  let app: INestApplication | undefined
  let bootError: unknown

  beforeAll(async () => {
    try {
      const ref = await Test.createTestingModule({ imports: [AppModule, StoreModule], controllers: [ProbeController] }).compile()
      app = ref.createNestApplication({ logger: false })
      await app.init()
    } catch (e) {
      bootError = e
    }
  })
  afterAll(() => app?.close())

  it('應用程式能建立（先完成練習 1）', () => {
    expect(bootError && String((bootError as Error).message).slice(0, 600), 'AppModule 建立失敗').toBeUndefined()
  })

  it('StoreContext、ProductsService、OrdersService 都是 singleton（app.get() 不會丟錯）', () => {
    expect(app, '先讓應用程式能建立').toBeDefined()
    for (const [name, token] of [['StoreContext', StoreContext], ['ProductsService', ProductsService], ['OrdersService', OrdersService]] as const) {
      let error: unknown
      try { app!.get(token, { strict: false }) } catch (e) { error = e }
      expect(error && String((error as Error).message).slice(0, 300), `${name} 還是 request-scoped：拿掉 Scope.REQUEST 和 @Inject(REQUEST)`).toBeUndefined()
    }
  })

  it('GET /menu 依 X-Store-Id 回各店的菜單，沒帶就是 1 號店', async () => {
    expect(app, '先讓應用程式能建立').toBeDefined()
    const server = app!.getHttpServer()
    const [one, two, none] = await Promise.all([
      request(server).get('/menu').set('X-Store-Id', '1'),
      request(server).get('/menu').set('X-Store-Id', '2'),
      request(server).get('/menu'),
    ])
    expect(one.body.map((p: { name: string }) => p.name), '1 號店有 6 樣商品').toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'])
    expect(two.body.map((p: { name: string }) => p.name), '2 號店只有 4 樣飲料').toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶'])
    expect(none.body.length, '沒帶 X-Store-Id 是 1 號店').toBe(6)
  })

  it('同時進來的請求，await 之後讀到的還是自己的分店（middleware 要套用在所有路由）', async () => {
    expect(app, '先讓應用程式能建立').toBeDefined()
    const server = app!.getHttpServer()
    const ids = ['1', '2', '1', '2', '2', '1']
    const res = await Promise.all(ids.map(async (id, i) => { await sleep(i * 5); return request(server).get('/probe').set('X-Store-Id', id) }))
    res.forEach((r, i) => {
      expect(r.status, 'GET /probe 要回 200：StoreContext 的 middleware 要用 forRoutes(\'*\') 套用在每個路由').toBe(200)
      expect(r.body, `X-Store-Id: ${ids[i]} 的請求在 await 前後都要讀到 ${ids[i]}：不能用模組層級的變數或 singleton 的欄位存目前的分店`).toEqual({ before: Number(ids[i]), after: Number(ids[i]) })
    })
  })
})
