// 練習 1：RequestIdMiddleware 與 @RequestId()。直接編譯 AppModule：只在 main.ts 用 app.use() 註冊的不算
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import * as decoratorModule from './src/request-id.decorator.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule) })
afterAll(() => app?.close())
const http = () => request(app.getHttpServer())

describe('練習 1：request id', () => {
  it('沒帶 X-Request-Id：回應標頭有一個新產生的 UUID，每次都不同', async () => {
    const a = await http().get('/menu')
    const b = await http().get('/products')
    expect(a.headers['x-request-id'], '回應要帶 X-Request-Id：在 AppModule 實作 NestModule，configure() 裡 consumer.apply(RequestIdMiddleware).forRoutes(\'*\')').toMatch(UUID)
    expect(b.headers['x-request-id'], '每個路由都要有 X-Request-Id（forRoutes(\'*\')），值用 crypto.randomUUID() 產生').toMatch(UUID)
    expect(a.headers['x-request-id'], '每個請求要有自己的編號，不能共用同一個').not.toBe(b.headers['x-request-id'])
  })

  it('帶合法的 X-Request-Id（英數、-、_，1–64 字元）：沿用呼叫端給的值', async () => {
    for (const id of ['order-2026_10_31', 'a', 'x'.repeat(64)]) {
      const res = await http().get('/menu').set('X-Request-Id', id)
      expect(res.headers['x-request-id'], `呼叫端送來合法的 ${JSON.stringify(id)}，要沿用它，讓前端、閘道和後端的 log 用同一個編號`).toBe(id)
    }
  })

  it('不合法的值（超過 64 字元、含 < > 空白等字元）：換成新的 UUID', async () => {
    for (const id of ['x'.repeat(65), 'a'.repeat(200), '<script>', 'abc def', 'id;drop', '中文編號']) {
      const res = await http().get('/menu').set('X-Request-Id', encodeURI(id) === id ? id : encodeURIComponent(id))
      expect(res.headers['x-request-id'], `呼叫端送來 ${JSON.stringify(id.slice(0, 20))}… 不符合規則（1–64 個英數、-、_），要換成新產生的 UUID，不能照抄`).toMatch(UUID)
    }
  })

  it('GET /whoami 回傳的 requestId 跟回應標頭一樣（呼叫端給了不合法的值也一樣）', async () => {
    const plain = await http().get('/whoami')
    expect(plain.status, 'GET /whoami 要回 200').toBe(200)
    expect(plain.body.requestId, 'GET /whoami 回 { requestId }：用 @RequestId() 參數裝飾器拿 middleware 放在 req.requestId 的值').toBe(plain.headers['x-request-id'])
    const bad = await http().get('/whoami').set('X-Request-Id', 'b'.repeat(100))
    expect(bad.body.requestId, '呼叫端給了不合法的編號時，/whoami 要回 middleware 換過的新編號，不是請求標頭的原始值：不要用 @Headers(\'x-request-id\')，用 @RequestId()').toBe(bad.headers['x-request-id'])
    expect(bad.body.requestId, '/whoami 要回 middleware 產生的 UUID').toMatch(UUID)
    const good = await http().get('/whoami').set('X-Request-Id', 'counter-7')
    expect(good.body.requestId, '合法的編號：/whoami 回呼叫端給的值').toBe('counter-7')
  })

  it('@RequestId() 讀的是 middleware 放在 req.requestId 的值（用在別的 controller 也一樣）', async () => {
    const RequestId = (decoratorModule as Record<string, unknown>).RequestId as (() => ParameterDecorator) | undefined
    expect(RequestId, 'src/request-id.decorator.ts 要 export const RequestId = createParamDecorator(...)').toBeTypeOf('function')
    @Controller('probe-request-id')
    class ProbeController {
      @Get()
      probe(id: unknown) { return { id } }
    }
    RequestId!()(ProbeController.prototype, 'probe', 0)
    @Module({ imports: [AppModule], controllers: [ProbeController] })
    class ProbeModule {}
    const probe = await createTestApp(ProbeModule)
    try {
      const res = await request(probe.getHttpServer()).get('/probe-request-id').set('X-Request-Id', 'z'.repeat(80))
      expect(res.body.id, '在另一個 controller 的 handler 參數寫 @RequestId()，要拿到 middleware 換過的編號（等於回應標頭）：createParamDecorator 的回呼回傳 ctx.switchToHttp().getRequest().requestId').toBe(res.headers['x-request-id'])
      expect(res.body.id, '@RequestId() 要拿到 middleware 產生的 UUID').toMatch(UUID)
    } finally {
      await probe.close()
    }
  })

  it('用 declaration merging 替 Request 加上 requestId，不用 any 繞過型別', () => {
    const strip = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    expect(strip('src/express.d.ts'), 'src/express.d.ts 要寫 declare global { namespace Express { interface Request { requestId: string } } }').toMatch(/namespace\s+Express[\s\S]*interface\s+Request[\s\S]*requestId\s*:\s*string/)
    for (const f of ['src/request-id.middleware.ts', 'src/request-id.decorator.ts']) {
      expect(strip(f), `${f} 不要用 any 繞過型別：在 src/express.d.ts 替 Request 加上 requestId，就能直接寫 req.requestId`).not.toMatch(/\bany\b/)
    }
  })
})
