// 練習 1：商品陣列與邏輯搬到 ProductsService，ProductsController 用建構子注入，只負責 HTTP
import { afterAll, describe, expect, it, vi } from 'vitest'
import { NotFoundException, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { ProductsService } from './src/products.service.js'

const apps: INestApplication[] = []
afterAll(() => Promise.all(apps.map(a => a.close())))

async function service() {
  const ref = await Test.createTestingModule({ providers: [ProductsService] }).compile()
  const s = ref.get(ProductsService) as any
  for (const m of ['findAll', 'findOne', 'create', 'update', 'remove']) {
    expect(typeof s[m], `ProductsService 要有 ${m}() 方法：把 ProductsController 裡同名方法的邏輯搬過來`).toBe('function')
  }
  return s
}

describe('練習 1：ProductsService', () => {
  it('findAll() 回傳六項商品，findAll(category) 只回傳那一類', async () => {
    const s = await service()
    expect(s.findAll().map((p: any) => p.name), 'findAll() 要回傳原本 controller 裡的六項商品').toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'])
    expect(s.findAll('tea').map((p: any) => p.name), "findAll('tea') 只回傳 tea 類").toEqual(['伯爵紅茶'])
  })

  it('findOne(id) 找得到回傳商品，找不到丟 NotFoundException', async () => {
    const s = await service()
    expect(s.findOne(2), 'findOne(2) 要回傳拿鐵').toEqual({ id: 2, name: '拿鐵', price: 110, category: 'coffee' })
    expect(() => s.findOne(99), 'findOne(99) 要丟 NotFoundException（service 直接 throw，不要碰 Express 的 response 物件）').toThrow(NotFoundException)
  })

  it('create、update、remove 會改變 service 裡的資料', async () => {
    const s = await service()
    const created = s.create({ name: '抹茶拿鐵', price: 120, category: 'tea' })
    expect(created, 'create() 要回傳帶有新 id（7）的商品').toEqual({ id: 7, name: '抹茶拿鐵', price: 120, category: 'tea' })
    expect(s.findOne(7).name, 'create() 之後 findOne(7) 要找得到').toBe('抹茶拿鐵')
    expect(s.update(1, { price: 85 }), 'update(1, { price: 85 }) 要回傳改過的商品').toEqual({ id: 1, name: '美式咖啡', price: 85, category: 'coffee' })
    s.remove(5)
    expect(() => s.findOne(5), 'remove(5) 之後 findOne(5) 要丟 NotFoundException').toThrow(NotFoundException)
    expect(() => s.remove(99), 'remove 不存在的商品要丟 NotFoundException').toThrow(NotFoundException)
  })
})

describe('練習 1：ProductsController 只負責 HTTP', () => {
  it('把 ProductsService 換成假的，每個路由都改用假的', async () => {
    const product = { id: 42, name: '測試商品', price: 1, category: 'food' }
    const fake = {
      findAll: vi.fn(() => [product]),
      findOne: vi.fn(() => product),
      create: vi.fn(() => product),
      update: vi.fn(() => product),
      remove: vi.fn(),
    }
    const app = await createTestApp(AppModule, { override: b => b.overrideProvider(ProductsService).useValue(fake) })
    apps.push(app)
    const http = () => request(app.getHttpServer())
    const hint = 'ProductsController 要在建構子注入 ProductsService 並呼叫它的方法；不要自己 new ProductsService()，也不要把陣列留在 controller'

    expect((await http().get('/products?category=food')).body, `GET /products：${hint}`).toEqual([product])
    expect(fake.findAll, 'GET /products?category=food 要把 category 傳給 findAll').toHaveBeenCalledWith('food')
    expect((await http().get('/products/42')).body, `GET /products/42：${hint}`).toEqual(product)
    expect(fake.findOne, 'GET /products/42 要把數字 42 傳給 findOne').toHaveBeenCalledWith(42)
    expect((await http().get('/products/42/price')).body, `GET /products/42/price 也要用 ProductsService.findOne 找商品（測試商品是 food、1 元）：${hint}`).toEqual({ id: 42, price: 1 })

    const created = await http().post('/products').send({ name: '測試商品', price: 1, category: 'food' })
    expect(created.status, 'POST /products 還是回 201').toBe(201)
    expect(fake.create, `POST /products：${hint}`).toHaveBeenCalledWith({ name: '測試商品', price: 1, category: 'food' })

    await http().patch('/products/42').send({ price: 2 })
    expect(fake.update, `PATCH /products/42：${hint}`).toHaveBeenCalledWith(42, { price: 2 })

    const removed = await http().delete('/products/42')
    expect(removed.status, 'DELETE /products/42 還是回 204').toBe(204)
    expect(fake.remove, `DELETE /products/42：${hint}`).toHaveBeenCalledWith(42)
  })

  it('真正的 service：找不到商品回 404', async () => {
    const app = await createTestApp(AppModule)
    apps.push(app)
    const res = await request(app.getHttpServer()).get('/products/99')
    expect(res.status, 'GET /products/99 要回 404：service 丟 NotFoundException，Nest 會轉成 404').toBe(404)
    const list = await request(app.getHttpServer()).get('/products')
    expect(list.body.length, 'GET /products 要回六項商品（AppModule 的 providers 要有 ProductsService）').toBe(6)
  })
})
