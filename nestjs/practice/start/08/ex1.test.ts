// 練習 1：領域錯誤與 DomainExceptionFilter。直接編譯 AppModule：只在 main.ts 用 useGlobalFilters() 註冊的不算
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Controller, Get, HttpException, Module, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { DomainError, OutOfStockError, ProductNotFoundError } from './src/errors/domain-errors.js'
import { OrdersService } from './src/orders/orders.service.js'
import { ProductsService } from './src/products/products.service.js'

// 測試專用的路由：丟出訊息完全不同、code 一樣的領域錯誤，確認 filter 是看 code 而不是比對文字
class SoldOutEnglish extends DomainError {
  readonly code = 'OUT_OF_STOCK'
  constructor() { super('Sold out', { productId: 99 }) }
}
class StampCardFull extends DomainError {
  readonly code = 'STAMP_CARD_FULL'
  constructor() { super('集點卡已經集滿', { cardId: 7 }) }
}
@Controller('test-domain')
class TestDomainController {
  @Get('english') english() { throw new SoldOutEnglish() }
  @Get('unknown') unknown() { throw new StampCardFull() }
}
@Module({ imports: [AppModule], controllers: [TestDomainController] })
class TestModule {}

const order = (productId: number, qty: number) => ({ customerId: 1, items: [{ productId, qty, size: 'M' }] })

// 同步丟出或回傳 rejected Promise 都接得到
const errorOf = async (fn: () => unknown) => {
  try { await fn() } catch (e) { return e }
  return undefined
}

describe('練習 1：OrdersService 丟領域錯誤，不依賴 HTTP', () => {
  it('ProductNotFoundError 存在，code 是 PRODUCT_NOT_FOUND', () => {
    expect(ProductNotFoundError, '在 src/errors/domain-errors.ts 照 OutOfStockError 的樣子 export class ProductNotFoundError extends DomainError').toBeTypeOf('function')
    const e = new ProductNotFoundError(42)
    expect(e, 'ProductNotFoundError 要 extends DomainError').toBeInstanceOf(DomainError)
    expect(e.code, "ProductNotFoundError 的 code 要是 'PRODUCT_NOT_FOUND'").toBe('PRODUCT_NOT_FOUND')
    expect(e.details, 'details 要是 { productId }').toEqual({ productId: 42 })
  })

  it('庫存不夠：丟 OutOfStockError，不是 HttpException，庫存沒有被扣', async () => {
    const products = new ProductsService()
    const service = new OrdersService(products)
    const err = await errorOf(() => service.create(order(6, 3) as never))
    expect(err, '起司蛋糕只剩 2 個，訂 3 個要丟 OutOfStockError（service 會被佇列、排程呼叫，不能丟 ConflictException 這種 HTTP 例外）').toBeInstanceOf(OutOfStockError)
    expect(err, 'service 不能丟 HttpException：HTTP 狀態碼交給 filter 決定').not.toBeInstanceOf(HttpException)
    expect((err as DomainError).details, 'details 要有 productId、requested、available：new OutOfStockError(product.id, item.qty, product.stock)').toEqual({ productId: 6, requested: 3, available: 2 })
    expect(products.find(6)?.stock, '失敗的訂單不能扣庫存').toBe(2)
  })

  it('找不到商品：丟 ProductNotFoundError', async () => {
    const service = new OrdersService(new ProductsService())
    const err = await errorOf(() => service.create(order(99, 1) as never))
    expect(err, '商品 99 不存在，要丟 ProductNotFoundError，不是 NotFoundException').toBeInstanceOf(ProductNotFoundError ?? class {})
    expect(err, 'service 不能丟 HttpException').not.toBeInstanceOf(HttpException)
  })
})

describe('練習 1：DomainExceptionFilter 把領域錯誤轉成 HTTP 回應', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(TestModule) })
  afterAll(() => app?.close())
  const http = () => request(app.getHttpServer())

  it('庫存不足 → 409，body 有 errorCode、details 與 requestId', async () => {
    const res = await http().post('/orders').send(order(6, 3))
    expect(res.status, "庫存不足要回 409：寫 @Catch(DomainError) 的 DomainExceptionFilter，在 AppModule 的 providers 用 { provide: APP_FILTER, useClass: DomainExceptionFilter } 登記（只寫在 main.ts 的 useGlobalFilters 不算）。已經做了練習 2、結果是 500 的話，是 AllExceptionsFilter 搶先接走了：APP_FILTER 要先登記 AllExceptionsFilter、再登記 DomainExceptionFilter").toBe(409)
    expect(res.body.statusCode, 'body.statusCode 要跟狀態碼一樣').toBe(409)
    expect(res.body.errorCode, "body.errorCode 要是 exception.code，也就是 'OUT_OF_STOCK'").toBe('OUT_OF_STOCK')
    expect(res.body.details, 'body.details 要是 exception.details，前端才知道是哪個商品、還剩幾個').toEqual({ productId: 6, requested: 3, available: 2 })
    expect(res.body.message, 'body.message 是給人看的文字（exception.message）').toBeTypeOf('string')
    expect(res.body.requestId, 'body.requestId 要等於回應標頭的 X-Request-Id（第 6 課的 middleware 放在 req.requestId）').toBe(res.headers['x-request-id'])
  })

  it('找不到商品 → 404，errorCode 是 PRODUCT_NOT_FOUND', async () => {
    const res = await http().post('/orders').send(order(99, 1))
    expect(res.status, '訂單裡的商品不存在要回 404').toBe(404)
    expect(res.body.errorCode, "errorCode 要是 'PRODUCT_NOT_FOUND'").toBe('PRODUCT_NOT_FOUND')
    expect(res.body.details, 'details 要是 { productId: 99 }').toEqual({ productId: 99 })
  })

  it('依 code 決定狀態碼，不比對 message 文字', async () => {
    const res = await http().get('/test-domain/english')
    expect(res.status, "測試丟出 code 是 'OUT_OF_STOCK'、message 是英文的領域錯誤，也要回 409：用 exception.code 查對照表，不要比對 message（文案會改、會翻譯）").toBe(409)
    expect(res.body.errorCode, 'errorCode 要是 OUT_OF_STOCK').toBe('OUT_OF_STOCK')
  })

  it('對照表沒有的 code → 422，errorCode 照樣帶出去', async () => {
    const res = await http().get('/test-domain/unknown')
    expect(res.status, "對照表沒列到的領域錯誤（例如 'STAMP_CARD_FULL'）要回 422：STATUS_BY_CODE[exception.code] ?? 422").toBe(422)
    expect(res.body.errorCode, 'errorCode 要是 STAMP_CARD_FULL').toBe('STAMP_CARD_FULL')
    expect(res.body.details, 'details 要帶出去').toEqual({ cardId: 7 })
  })

  it('成功的訂單不受影響', async () => {
    const res = await http().post('/orders').send(order(2, 2))
    expect(res.status, '拿鐵 2 杯要下單成功（201）').toBe(201)
    expect(res.body.total, '總額 220').toBe(220)
  })
})
