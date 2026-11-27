// 練習 1：全域 PrismaExceptionFilter
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Controller, Get, Inject, Logger, Module, Param, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { Prisma } from './src/generated/prisma/client.js'
import { PrismaService } from './src/prisma/prisma.service.js'

// Prisma 原本的錯誤訊息長這樣：有檔案路徑、程式碼片段、constraint 名稱，一個字都不能送到前端
const RAW = 'Invalid `prisma.product.create()` invocation in\n/srv/coffee/src/products/products.service.ts:21:31\n\nUnique constraint failed on the constraint: `products_name_key`'
const LEAK = /Invalid|invocation|constraint|products_name_key|\/srv\/|\.ts:\d+|Unique constraint|Foreign key/

@Controller('test-prisma')
class TestPrismaController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('known/:code') known(@Param('code') code: string) {
    throw new Prisma.PrismaClientKnownRequestError(RAW, { code, clientVersion: '7.10.1' })
  }

  // 真的去資料庫更新一筆不存在的商品：Prisma 丟出 P2025
  @Get('missing') missing() {
    return this.prisma.product.update({ where: { id: 987654 }, data: { price: 1 } })
  }
}
@Module({ imports: [AppModule], controllers: [TestPrismaController] })
class TestModule {}

describe('練習 1：Prisma 錯誤 → 一致的 HTTP 錯誤', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(TestModule) })
  afterAll(async () => { await app?.close() })
  const http = () => request(app.getHttpServer())

  it('P2002（唯一值衝突）→ 409 UNIQUE_VIOLATION，訊息不外洩', async () => {
    const res = await http().get('/test-prisma/known/P2002')
    expect(res.status, 'P2002 要回 409。filter 有用 APP_FILTER 登記在 AppModule 嗎？沒登記時是 Nest 內建的 500').toBe(409)
    expect(res.body, "body 要有 statusCode: 409、error: 'Conflict'、errorCode: 'UNIQUE_VIOLATION'").toMatchObject({ statusCode: 409, error: 'Conflict', errorCode: 'UNIQUE_VIOLATION' })
    expect(typeof res.body.message, 'message 要是給人看的固定中文訊息').toBe('string')
    expect(res.text, '回應不能出現 Prisma 的原文（exception.message 有檔案路徑與 constraint 名稱）：message 用你自己寫的固定文字').not.toMatch(LEAK)
  })

  it('P2003（外鍵）→ 409 FOREIGN_KEY_VIOLATION', async () => {
    const res = await http().get('/test-prisma/known/P2003')
    expect(res.status, 'P2003 要回 409：參照的資料不存在，或還有資料參照它而不能刪').toBe(409)
    expect(res.body.errorCode, "errorCode 要是 'FOREIGN_KEY_VIOLATION'").toBe('FOREIGN_KEY_VIOLATION')
    expect(res.text, '回應不能出現 Prisma 的原文').not.toMatch(LEAK)
  })

  it('真的從資料庫來的 P2025（更新不存在的資料）→ 404 NOT_FOUND', async () => {
    const res = await http().get('/test-prisma/missing')
    expect(res.status, 'update／delete 找不到資料時 Prisma 丟 P2025，要回 404，不是 500').toBe(404)
    expect(res.body, "body 要有 statusCode: 404、error: 'Not Found'、errorCode: 'NOT_FOUND'").toMatchObject({ statusCode: 404, error: 'Not Found', errorCode: 'NOT_FOUND' })
    expect(res.text, '回應不能出現 Prisma 的原文').not.toMatch(/Invalid|invocation|required but not found|\.ts:\d+/)
  })

  it('真的從資料庫來的 P2003：POST /products 的 categoryId 不存在 → 409', async () => {
    const res = await http().post('/products').send({ name: `測試商品-${Date.now()}`, price: 50, categoryId: 987654 })
    expect(res.status, '分類不存在時 INSERT 違反外鍵，Prisma 丟 P2003，要回 409（service 沒處理的 Prisma 錯誤由全域 filter 接）').toBe(409)
    expect(res.body.errorCode, "errorCode 要是 'FOREIGN_KEY_VIOLATION'").toBe('FOREIGN_KEY_VIOLATION')
  })

  it('沒列在表上的代碼 → 500 INTERNAL_ERROR，並寫 log', async () => {
    const spy = vi.spyOn(Logger.prototype, 'error')
    const staticSpy = vi.spyOn(Logger, 'error')
    try {
      const res = await http().get('/test-prisma/known/P2039')
      expect(res.status, '不認得的代碼（例如 P2039 CHECK 約束、P2034 死結）不能當成 404 或 409：回 500').toBe(500)
      expect(res.body.errorCode, "errorCode 要是 'INTERNAL_ERROR'").toBe('INTERNAL_ERROR')
      expect(res.text, '500 一樣不能外洩 Prisma 的原文').not.toMatch(LEAK)
      const logged = [...spy.mock.calls, ...staticSpy.mock.calls].flat().map(String).join('\n')
      expect(logged, '500 是你要修的問題：用 new Logger(PrismaExceptionFilter.name).error(訊息, exception.stack) 記下來，log 裡要有錯誤代碼').toContain('P2039')
    } finally {
      spy.mockRestore()
      staticSpy.mockRestore()
    }
  })

  it('領域錯誤照舊由 DomainExceptionFilter 處理', async () => {
    const res = await http().get('/orders/987654')
    expect(res.status, '找不到訂單是 OrderNotFoundError → 404，不要動到 DomainExceptionFilter').toBe(404)
    expect(res.body.errorCode).toBe('ORDER_NOT_FOUND')
  })
})
