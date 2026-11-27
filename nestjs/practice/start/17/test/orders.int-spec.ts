import { Test, type TestingModule } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { OrdersService } from '../src/orders/orders.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { createCustomer, createProduct } from './support/factories.js'
import { resetDb } from './support/reset-db.js'

// 練習 3：OrdersService 的整合測試，連真的 PostgreSQL（npm test 用的是 nest_17_spec）
describe('OrdersService.createOrder（真的資料庫）', () => {
  let moduleRef: TestingModule
  let orders: OrdersService
  let prisma: PrismaService

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    orders = moduleRef.get(OrdersService)
    prisma = moduleRef.get(PrismaService)
  })
  afterAll(() => moduleRef.close())   // 關掉應用，PrismaService 才會釋放連線池
  beforeEach(() => resetDb(prisma))   // 每個測試都從空的資料表開始

  it.todo('成功下單：扣庫存，訂單總額與明細正確')
  it.todo('庫存不足：丟 OutOfStockError，不建立訂單')
  it.todo('第二項庫存不足：整筆回滾，第一項的庫存也沒被扣')
  it.todo('單價快照：下單後商品改價，訂單的單價與總額不變')
  it.todo('庫存 5、同時 10 張訂單：剛好 5 張成功，庫存變 0，不會賣超')
})
