// 練習 1：configureApp(app) 套上全域前綴與 CORS 允許清單，main.ts 也用它
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { build, start } from '../../helpers/server.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { PaymentGateway } from './src/payments/payment.gateway.js'

const FRONTEND = 'http://localhost:5173'
const OTHERS = ['https://evil.example', 'http://localhost:5173.evil.example', 'http://localhost:3000']
const order = { customerId: 1, items: [{ productId: 2, qty: 1, size: 'M' }] }

describe('練習 1：用 configureApp 建出來的 app（跟 e2e 測試一樣）', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await createTestApp(AppModule, {
      override: b => b.overrideProvider(PaymentGateway).useValue({ charge: async () => ({ chargeId: 'ch_test' }) }),
      configure: configureApp,
    })
  })
  afterAll(() => app?.close())
  const http = () => request(app.getHttpServer())

  it('路由在 /api 底下：POST /api/orders 是 201，/orders 是 404', async () => {
    const res = await http().post('/api/orders').send(order)
    expect(res.status, "POST /api/orders 要是 201：在 configureApp 裡呼叫 app.setGlobalPrefix('api')（只寫在 main.ts 的話，測試建出來的 app 沒有前綴）").toBe(201)
    expect((await http().post('/orders').send(order)).status, '沒有前綴的 /orders 要是 404：前綴只能有一種').toBe(404)
  })

  it('全域 pipe 與 filter 在 /api 底下照樣有效', async () => {
    const res = await http().post('/api/orders').send({ customerId: 1 })
    expect(res.status, '缺 items 要 400（ValidationPipe 已經用 APP_PIPE 登記在 AppModule，不要拿掉）').toBe(400)
    expect(res.body.errorCode, '錯誤格式要有 errorCode（第 8 課的 filter）').toBe('VALIDATION_FAILED')
  })

  it(`CORS：${FRONTEND} 拿得到 Access-Control-Allow-Origin`, async () => {
    const res = await http().get('/api/products/1').set('Origin', FRONTEND)
    expect(res.headers['access-control-allow-origin'], `在 configureApp 裡 app.enableCors({ origin: ['${FRONTEND}'] })`).toBe(FRONTEND)
    const pre = await http().options('/api/orders').set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type')
    expect(pre.status, '預檢請求（OPTIONS）要回 204').toBe(204)
    expect(pre.headers['access-control-allow-origin'], '預檢請求也要允許前端的來源').toBe(FRONTEND)
  })

  it.each(OTHERS)('CORS：其他來源 %s 拿不到 Access-Control-Allow-Origin', async origin => {
    const res = await http().get('/api/products/1').set('Origin', origin)
    expect(res.headers['access-control-allow-origin'], `${origin} 不在允許清單裡，回應不能有 Access-Control-Allow-Origin。origin 不要用 '*'、true、寬鬆的正規表示式或單一字串（單一字串會對每個來源都回這個標頭），寫成完整來源字串的陣列`).toBeUndefined()
  })
})

describe('練習 1：正式啟動（nest build → node dist/main.js）也用 configureApp', () => {
  const dir = import.meta.dirname

  it('main.ts 呼叫 configureApp(app)', () => {
    const main = readFileSync(join(dir, 'src/main.ts'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    expect(main, 'src/main.ts 要 import 並呼叫 configureApp(app)，全域設定只寫在一個地方').toMatch(/configureApp\s*\(/)
  })

  it('啟動後：/api 前綴與 CORS 允許清單跟測試一樣', async () => {
    build(dir)
    const server = await start(dir)
    try {
      const ok = await fetch(`${server.url}/api/products/1`, { headers: { Origin: FRONTEND } })
      expect(ok.status, '正式啟動後 GET /api/products/1 要是 200').toBe(200)
      expect(ok.headers.get('access-control-allow-origin'), '正式啟動後前端的來源要被允許').toBe(FRONTEND)
      const evil = await fetch(`${server.url}/api/products/1`, { headers: { Origin: 'https://evil.example' } })
      expect(evil.headers.get('access-control-allow-origin'), '正式啟動後，其他來源不能拿到 Access-Control-Allow-Origin：main.ts 不要另外呼叫 app.enableCors()（正式環境的 CORS 會跟測試不一樣），configureApp 的 origin 用來源字串的陣列').toBeNull()
    } finally {
      await server.stop()
    }
  }, 90_000)
})
