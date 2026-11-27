// 練習 3：catch-all 不能弄壞既有的 4xx 與領域錯誤
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { BadGatewayException, Controller, ForbiddenException, Get, HttpException, Logger, Module, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

@Controller('test-http')
class TestHttpController {
  @Get('forbidden') forbidden() { throw new ForbiddenException('只有店長可以看') }
  @Get('teapot') teapot() { throw new HttpException('今天不賣茶', 418) }
  @Get('gateway') gateway() {
    throw new BadGatewayException('金流服務暫時無法使用', { cause: new Error('payment api ECONNRESET 10.0.3.7:443'), errorCode: 'PAYMENT_GATEWAY_FAILED' })
  }
}

// 把 logger.error 的參數攤平成文字（Error 物件取 stack）
const logged = (spies: { mock: { calls: unknown[][] } }[]) => spies.flatMap(s => s.mock.calls)
  .map(args => args.map(a => a instanceof Error ? `${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)).join('\n'))
@Module({ imports: [AppModule], controllers: [TestHttpController] })
class TestModule {}

describe('練習 3：HttpException 保留原狀態與內容，補上 errorCode 與 requestId', () => {
  let app: INestApplication
  const instanceSpy = vi.spyOn(Logger.prototype, 'error')
  const staticSpy = vi.spyOn(Logger, 'error')
  beforeAll(async () => { app = await createTestApp(TestModule) })
  afterAll(async () => { await app?.close(); instanceSpy.mockRestore(); staticSpy.mockRestore() })
  const http = () => request(app.getHttpServer())

  it('ValidationPipe 的 400：保留以欄位分組的 message，errorCode 是 VALIDATION_FAILED', async () => {
    const res = await http().post('/orders').send({ customerId: 'abc', items: [{ productId: 1, qty: 99, size: 'XL' }] })
    expect(res.status, '驗證失敗要維持 400：catch-all 遇到 HttpException 要用 exception.getStatus()，不能一律 500').toBe(400)
    expect(res.body.message, "message 要保留 ValidationPipe 產生的物件（以欄位路徑分組），例如 message['items.0.qty']：用 exception.getResponse()，不是 exception.message").toBeTypeOf('object')
    expect(Object.keys(res.body.message ?? {}).sort(), '每個出錯的欄位都要在 message 裡').toEqual(['customerId', 'items.0.qty', 'items.0.size'])
    expect(res.body.error, "原本的 error: 'Bad Request' 要保留").toBe('Bad Request')
    expect(res.body.statusCode, 'statusCode 要保留').toBe(400)
    expect(res.body.errorCode, "沒有 errorCode 的 400 要補上 'VALIDATION_FAILED'").toBe('VALIDATION_FAILED')
    expect(res.body.requestId, 'requestId 要等於 X-Request-Id 標頭').toBe(res.headers['x-request-id'])
  })

  it('不存在的路由：404，保留 Nest 的訊息，errorCode 是 NOT_FOUND', async () => {
    const res = await http().get('/no-such-route')
    expect(res.status, '不存在的路由要維持 404').toBe(404)
    expect(res.body.message, "message 要保留 'Cannot GET /no-such-route'").toBe('Cannot GET /no-such-route')
    expect(res.body.errorCode, "沒有 errorCode 的 404 要補上 'NOT_FOUND'").toBe('NOT_FOUND')
    expect(res.body.requestId, 'requestId 要等於 X-Request-Id 標頭').toBe(res.headers['x-request-id'])
  })

  it('已經有 errorCode 的 HttpException：不能被蓋掉', async () => {
    const res = await http().get('/products/99')
    expect(res.status, 'GET /products/99 要維持 404').toBe(404)
    expect(res.body.message, "message 要保留 '找不到商品 99'").toBe('找不到商品 99')
    expect(res.body.errorCode, "controller 已經給了 errorCode 'PRODUCT_NOT_FOUND'，不能被換成 NOT_FOUND：先看 exception.errorCode，沒有才依狀態碼補").toBe('PRODUCT_NOT_FOUND')
  })

  it('其他狀態碼：保留狀態與訊息，errorCode 是 HTTP_<狀態碼>', async () => {
    const forbidden = await http().get('/test-http/forbidden')
    expect(forbidden.status, 'ForbiddenException 要維持 403').toBe(403)
    expect(forbidden.body.message, 'message 要保留').toBe('只有店長可以看')
    expect(forbidden.body.errorCode, "對照表沒有的狀態碼，errorCode 是 'HTTP_403'").toBe('HTTP_403')
    const teapot = await http().get('/test-http/teapot')
    expect(teapot.status, "new HttpException('今天不賣茶', 418) 要維持 418").toBe(418)
    expect(teapot.body, "getResponse() 是字串時，body 要是 { statusCode, message, errorCode, requestId }").toMatchObject({ statusCode: 418, message: '今天不賣茶', errorCode: 'HTTP_418', requestId: teapot.headers['x-request-id'] })
  })

  it('4xx 不寫 error log（那是客戶端的問題，寫了只會淹沒真正的 5xx）', async () => {
    await http().get('/test-http/forbidden')
    await http().post('/orders').send({})
    expect([...instanceSpy.mock.calls, ...staticSpy.mock.calls], '只有 5xx 才 logger.error；4xx 不要寫 error log').toEqual([])
  })

  it('5xx 的 HttpException：保留內容、寫 error log，cause 只進 log', async () => {
    const res = await http().get('/test-http/gateway')
    expect(res.status, 'BadGatewayException 要維持 502').toBe(502)
    expect(res.body, '要保留 message 與例外自己帶的 errorCode').toMatchObject({ statusCode: 502, message: '金流服務暫時無法使用', errorCode: 'PAYMENT_GATEWAY_FAILED', requestId: res.headers['x-request-id'] })
    expect(res.text, 'cause 是給自己看的：回應不能出現 cause 的內容').not.toMatch(/ECONNRESET|10\.0\.3\.7/)
    const entry = logged([instanceSpy, staticSpy]).find(l => l.includes(res.headers['x-request-id']))
    expect(entry, '5xx 要寫 error log（訊息含 requestId）：status >= 500 時 this.logger.error(…)').toBeDefined()
    expect(entry, "log 裡要有 cause 的內容：Nest 內建的 filter 不記錄 HttpException，exception.stack 也不含 cause，要自己把 exception.cause（instanceof Error 時取它的 stack）一起寫進 log").toContain('ECONNRESET')
  })

  it('領域錯誤還是由 DomainExceptionFilter 處理（catch-all 沒有搶走）', async () => {
    const res = await http().post('/orders').send({ customerId: 1, items: [{ productId: 6, qty: 3, size: 'S' }] })
    expect(res.status, '庫存不足還是要 409：全域 filter 由後往前比對，APP_FILTER 要先登記 AllExceptionsFilter、再登記 DomainExceptionFilter').toBe(409)
    expect(res.body.errorCode, 'errorCode 要是 OUT_OF_STOCK').toBe('OUT_OF_STOCK')
  })
})
