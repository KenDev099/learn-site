// 練習 1：把商品、訂單拆成兩個功能模組，只 export 該公開的 provider
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { ProductsModule } from './src/products/products.module.js'
import { ProductsService } from './src/products/products.service.js'
import { ProductsRepository } from './src/products/products.repository.js'
import { ProductsController } from './src/products/products.controller.js'
import { OrdersModule } from './src/orders/orders.module.js'
import { OrdersService } from './src/orders/orders.service.js'
import { OrdersController } from './src/orders/orders.controller.js'

const meta = (key: string, target: object): unknown[] => Reflect.getMetadata(key, target) ?? []

describe('練習 1：ProductsModule 與 OrdersModule', () => {
  it('ProductsModule 登記商品的 controller 與 provider，只 export ProductsService', () => {
    expect(meta('controllers', ProductsModule), 'ProductsModule 的 controllers 要有 ProductsController').toContain(ProductsController)
    expect(meta('providers', ProductsModule), 'ProductsModule 的 providers 要有 ProductsService').toContain(ProductsService)
    expect(meta('providers', ProductsModule), 'ProductsModule 的 providers 要有 ProductsRepository').toContain(ProductsRepository)
    expect(meta('exports', ProductsModule), 'ProductsModule 只 export ProductsService：ProductsRepository 是內部細節，別的模組不該直接用').toEqual([ProductsService])
  })

  it('OrdersModule import ProductsModule，自己的 providers 只有 OrdersService', () => {
    expect(meta('controllers', OrdersModule), 'OrdersModule 的 controllers 要有 OrdersController').toContain(OrdersController)
    expect(meta('imports', OrdersModule), 'OrdersModule 要在 imports 寫上 ProductsModule，才拿得到它 export 的 ProductsService').toContain(ProductsModule)
    expect(meta('providers', OrdersModule), 'OrdersModule 的 providers 只放 OrdersService：把 ProductsService 再放一次會多出第二個實例').toEqual([OrdersService])
    expect(Reflect.getMetadata('__module:global__', ProductsModule), '不要把 ProductsModule 設成 @Global：依賴要寫在 imports 上看得到').toBeFalsy()
  })

  it('AppModule 只 import 功能模組，不再自己登記商品、訂單的 controller 與 provider', () => {
    const imports = meta('imports', AppModule)
    expect(imports, 'AppModule 的 imports 要有 ProductsModule').toContain(ProductsModule)
    expect(imports, 'AppModule 的 imports 要有 OrdersModule').toContain(OrdersModule)
    for (const p of [ProductsService, ProductsRepository, OrdersService]) {
      expect(meta('providers', AppModule), `AppModule 的 providers 不要再放 ${p.name}，它屬於功能模組`).not.toContain(p)
    }
    for (const c of [ProductsController, OrdersController]) {
      expect(meta('controllers', AppModule), `AppModule 的 controllers 不要再放 ${c.name}，它屬於功能模組`).not.toContain(c)
    }
  })

  it('OrdersModule 單獨拿出來也能建立（依賴都寫在自己的 imports 上）', async () => {
    const ref = await Test.createTestingModule({ imports: [OrdersModule] }).compile()
      .catch((e: Error) => { throw new Error(`只 import OrdersModule 就建立失敗：${e.message.split('\n')[0]}`) })
    let service: unknown
    try { service = ref.get(OrdersService) } catch { service = undefined }
    await ref.close()
    expect(service, 'OrdersModule 的 providers 要有 OrdersService').toBeInstanceOf(OrdersService)
  })
})

describe('練習 1：從 HTTP 確認商品與訂單用的是同一份資料', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())

  it('POST /orders 用商品資料的價格計算總額', async () => {
    const res = await request(app.getHttpServer()).post('/orders').send({ productId: 2, quantity: 3 })
    expect(res.status, 'POST /orders 要回 201').toBe(201)
    expect(res.body, '拿鐵 110 元 × 3 杯').toEqual({ productId: 2, name: '拿鐵', quantity: 3, unitPrice: 110, total: 330 })
  })

  it('剛用 POST /products 新增的商品，馬上可以下訂單', async () => {
    const created = await request(app.getHttpServer()).post('/products').send({ name: '燕麥拿鐵', price: 130 })
    expect(created.status, 'POST /products 要回 201').toBe(201)
    const res = await request(app.getHttpServer()).post('/orders').send({ productId: created.body.id, quantity: 2 })
    expect(res.status, '訂單找不到剛新增的商品：OrdersService 拿到的 ProductsService 跟 ProductsController 用的不是同一個實例。不要把 ProductsService 放進 OrdersModule 的 providers，改成 import ProductsModule').toBe(201)
    expect(res.body.total, '燕麥拿鐵 130 元 × 2 杯').toBe(260)
  })
})
