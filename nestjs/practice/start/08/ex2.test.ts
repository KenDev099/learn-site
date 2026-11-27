// 練習 2：AllExceptionsFilter 接住非預期的錯誤
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Controller, Get, Logger, Module, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

const SECRET_MESSAGE = 'duplicate key value violates unique constraint "customers_phone_key" (connection postgres://shop:password=s3cret@db)'

// 測試專用的路由：模擬資料庫錯誤、程式 bug、丟出不是 Error 的值
@Controller('test-errors')
class TestErrorsController {
  @Get('db') db() { throw new Error(SECRET_MESSAGE) }
  @Get('bug') bug() { const order = undefined as unknown as { total: number }; return order.total }
  @Get('string') str() { throw 'oops' }   // eslint-disable-line no-throw-literal
  @Get('async') async later() { await Promise.resolve(); throw new Error(SECRET_MESSAGE) }
}
@Module({ imports: [AppModule], controllers: [TestErrorsController] })
class TestModule {}

// 學習者可能用 new Logger(...).error 或 Logger.error：兩個都監聽，把參數攤平成文字（Error 物件取 stack）
const logged = (spies: { mock: { calls: unknown[][] } }[]) => spies.flatMap(s => s.mock.calls)
  .map(args => args.map(a => a instanceof Error ? `${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)).join('\n'))

describe('練習 2：非預期的錯誤 → 500、固定訊息、記錄堆疊', () => {
  let app: INestApplication
  const instanceSpy = vi.spyOn(Logger.prototype, 'error')
  const staticSpy = vi.spyOn(Logger, 'error')
  beforeAll(async () => { app = await createTestApp(TestModule) })
  afterAll(async () => { await app?.close(); instanceSpy.mockRestore(); staticSpy.mockRestore() })
  const http = () => request(app.getHttpServer())

  it('資料庫錯誤 → 500，body 只有固定欄位，不外洩 SQL 與密碼', async () => {
    const res = await http().get('/test-errors/db')
    expect(res.status, '非預期的錯誤要回 500：httpAdapter.reply(res, body, 500)，或 res.status(500).json(body)，只寫 json() 會是 200').toBe(500)
    expect(res.body, "body 要剛好是 { statusCode: 500, error: 'Internal Server Error', message: '伺服器發生錯誤', errorCode: 'INTERNAL_ERROR', requestId }：寫 @Catch() 的 AllExceptionsFilter，用 APP_FILTER 登記").toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: '伺服器發生錯誤',
      errorCode: 'INTERNAL_ERROR',
      requestId: res.headers['x-request-id'],
    })
    expect(res.text, '回應不能出現原本的錯誤訊息：不要回 exception.message').not.toMatch(/constraint|password|s3cret|customers_phone_key/)
    expect(res.text, '回應不能出現堆疊').not.toMatch(/\bat \w|\.ts:\d+/)
  })

  it('用 Logger.error 記錄堆疊與 requestId', async () => {
    const res = await http().get('/test-errors/db')
    const lines = logged([instanceSpy, staticSpy])
    expect(lines.length, "非預期的錯誤要寫 log：private readonly logger = new Logger(AllExceptionsFilter.name)，再 this.logger.error(訊息, exception.stack)").toBeGreaterThan(0)
    const entry = lines.find(l => l.includes(res.headers['x-request-id']))
    expect(entry, 'log 裡要有這個請求的 requestId（req.requestId），才能從使用者回報的編號找到這一筆').toBeDefined()
    expect(entry, 'log 裡要有原本的錯誤訊息與堆疊：把 exception.stack 當第二個參數傳給 logger.error').toContain('customers_phone_key')
    expect(entry, 'log 裡要有堆疊（exception.stack，裡面有「at …」的那幾行），不是只有 message').toMatch(/\n\s+at /)
  })

  it('程式 bug（TypeError）、async handler 的錯誤也一樣處理', async () => {
    for (const path of ['/test-errors/bug', '/test-errors/async']) {
      const res = await http().get(path)
      expect(res.status, `${path} 要回 500`).toBe(500)
      expect(res.body.errorCode, `${path} 的 errorCode 要是 INTERNAL_ERROR`).toBe('INTERNAL_ERROR')
      expect(res.text, `${path} 不能外洩原本的訊息`).not.toMatch(/Cannot read|constraint|password/)
    }
  })

  it('丟出的不是 Error（throw 字串）：filter 自己不能再出錯', async () => {
    const res = await http().get('/test-errors/string')
    expect(res.status, "throw 'oops' 也要回 500：exception 的型別是 unknown，取 stack 前先判斷 exception instanceof Error").toBe(500)
    expect(res.body.message, "message 一樣是固定的 '伺服器發生錯誤'").toBe('伺服器發生錯誤')
    expect(res.body.requestId, 'requestId 一樣要有').toBe(res.headers['x-request-id'])
  })
})
