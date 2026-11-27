// 練習 3：回應只送允許清單裡的欄位，巢狀的 customer 也一樣
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { CustomersService } from './src/customers/customers.service.js'

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule) })
afterAll(() => app?.close())
const http = () => request(app.getHttpServer())

describe('練習 3：序列化', () => {
  it('GET /customers/:id 只有 id、name、stamps', async () => {
    const res = await http().get('/customers/1')
    expect(res.status, 'GET /customers/1 要回 200').toBe(200)
    expect(res.body, 'GET /customers/1 不能送出 phone、internalNote：寫 customerResponseSchema（z.object 只列 id、name、stamps），在路由上 @SerializeOptions({ schema })，並用 APP_INTERCEPTOR 註冊 StandardSchemaSerializerInterceptor').toStrictEqual({ id: 1, name: '王小明', stamps: 7 })
    const other = await http().get('/customers/3')
    expect(other.body, '每一位顧客都一樣，不能只對 1 號有效').toStrictEqual({ id: 3, name: '林志豪', stamps: 0 })
  })

  it('GET /orders/:id 裡的 customer 也不能有 phone、internalNote', async () => {
    const res = await http().get('/orders/1')
    expect(res.status, 'GET /orders/1 要回 200').toBe(200)
    expect(res.body, 'GET /orders/1 的 customer 也是顧客資料：訂單的 schema 裡 customer 欄位要用同一份 customerResponseSchema；其他欄位一個都不能少，也不能多（z.looseObject／passthrough 會把沒列的欄位留下來）').toStrictEqual({
      id: 1,
      customerId: 1,
      items: [{ productId: 2, name: '拿鐵', qty: 2, unitPrice: 110 }, { productId: 5, name: '可頌', qty: 1, unitPrice: 70 }],
      total: 290,
      status: 'done',
      customer: { id: 1, name: '王小明', stamps: 7 },
    })
  })

  it('新建立的訂單查詢時也一樣', async () => {
    const created = await http().post('/orders').send({ customerId: 5, items: [{ productId: 1, qty: 1, size: 'L' }] })
    expect(created.status, 'POST /orders 要回 201').toBe(201)
    const res = await http().get(`/orders/${created.body.id}`)
    expect(res.body.customer, '李建國的訂單：customer 只有 id、name、stamps').toStrictEqual({ id: 5, name: '李建國', stamps: 4 })
  })

  it('找不到時還是 404，錯誤回應不受序列化影響', async () => {
    const res = await http().get('/customers/999')
    expect(res.status, 'GET /customers/999 是 404').toBe(404)
    expect(res.body.errorCode, '404 的 errorCode 是 CUSTOMER_NOT_FOUND').toBe('CUSTOMER_NOT_FOUND')
  })

  it('回傳值不符合 schema 時是 500，不送出殘缺的資料', async () => {
    // 另外建一個應用程式：CustomersService 回傳的顧客少了 stamps（例如資料表改了欄位名稱）
    const broken = await createTestApp(AppModule, {
      override: b => b.overrideProvider(CustomersService).useValue({ find: (id: number) => ({ id, name: '王小明', phone: '0912-345-678' }) }),
    })
    try {
      const res = await request(broken.getHttpServer()).get('/customers/1')
      expect(res.status, '回傳值少了 stamps，要變成 500：用 @SerializeOptions({ schema }) 讓 StandardSchemaSerializerInterceptor 驗證回應，不要在 controller 裡自己挑欄位（那樣會送出缺欄位的 200）').toBe(500)
      expect(JSON.stringify(res.body), '500 的回應也不能帶出 phone').not.toContain('0912')
    } finally {
      await broken.close()
    }
  })

  it('內部資料還留在 service 裡：只在回應時過濾，不是把資料刪掉', () => {
    const customer = app.get(CustomersService).find(1)
    expect(customer?.phone, 'CustomersService 裡的 phone 要留著（取餐簡訊要用）：過濾是回應這一層的事，不要改 service 的資料').toBe('0912-345-678')
    expect(customer?.internalNote, 'CustomersService 裡的 internalNote 要留著（店員要看）').toBe('常客，上次反映冰拿鐵太淡')
  })
})
