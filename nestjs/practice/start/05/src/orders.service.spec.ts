// 練習 2：用 Test.createTestingModule 測 OrdersService.create，ProductsService 與 OrdersRepository 換成 vi.fn 替身
import { Test } from '@nestjs/testing'
import { OrdersService, OutOfStockError } from './orders.service.js'
import { ProductsService } from './products.service.js'
import { OrdersRepository } from './orders.repository.js'

describe('OrdersService.create', () => {
  it.todo('把 todo 換成真的測試')
})
