// 練習 1：商品的 CRUD 路由。每個測試都建一個新的應用，資料從頭開始
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

let app: INestApplication
beforeEach(async () => { app = await createTestApp(AppModule) })
afterEach(() => app?.close())
const http = () => request(app.getHttpServer())

const latte = { id: 2, name: '拿鐵', price: 110, category: 'coffee', tags: ['hot', 'iced', 'milk'] }

describe('練習 1：商品的 CRUD 路由', () => {
  it('GET /products 回 200 和 6 項商品；?category=tea 只回紅茶', async () => {
    const all = await http().get('/products')
    expect(all.status, 'GET /products 要回 200').toBe(200)
    expect(all.body, 'GET /products 要回全部 6 項商品').toHaveLength(6)
    const tea = await http().get('/products').query({ category: 'tea' })
    expect(tea.body.map((p: { name: string }) => p.name), '?category=tea 只回 category 是 tea 的商品：用 @Query(\'category\') 取值再篩選').toEqual(['伯爵紅茶'])
    const none = await http().get('/products').query({ category: 'juice' })
    expect(none.body, '沒有符合的分類要回空陣列，不是全部').toEqual([])
  })

  it('GET /products/2 回拿鐵，id 在 JSON 裡是數字', async () => {
    const res = await http().get('/products/2')
    expect(res.status, 'GET /products/2 要回 200。回 404 的話：路徑參數一開始是字串 \'2\'，跟數字 2 用 === 比永遠不相等，用 ParseIntPipe 轉成數字').toBe(200)
    expect(res.body, 'GET /products/2 要回整筆拿鐵資料（id 是數字 2）').toEqual(latte)
  })

  it('GET /products/99 回 404；GET /products/abc 回 400', async () => {
    const missing = await http().get('/products/99')
    expect(missing.status, '找不到商品要 throw new NotFoundException()，回 200 加空的內容會讓前端以為成功').toBe(404)
    const bad = await http().get('/products/abc')
    expect(bad.status, 'id 不是數字要回 400：@Param(\'id\', ParseIntPipe) 會幫你擋').toBe(400)
  })

  it('POST /products 回 201 和含新 id 的商品，之後查得到', async () => {
    const res = await http().post('/products').send({ name: '冰滴咖啡', price: 130, category: 'coffee', tags: ['iced'] })
    expect(res.status, 'POST 成功預設就是 201，不要改成別的').toBe(201)
    expect(res.body, '回傳新商品，含 Nest 收到的欄位').toMatchObject({ name: '冰滴咖啡', price: 130, category: 'coffee', tags: ['iced'] })
    expect(res.body.id, '新商品的 id 是數字，而且不能跟現有的 1–6 重複').toBeTypeOf('number')
    expect([1, 2, 3, 4, 5, 6], '新商品的 id 不能跟現有的 1–6 重複').not.toContain(res.body.id)
    const got = await http().get(`/products/${res.body.id}`)
    expect(got.body, '新增後要能用 GET /products/:id 查到同一筆').toEqual(res.body)
    const second = await http().post('/products').send({ name: '燕麥拿鐵', price: 130, category: 'coffee', tags: ['milk'] })
    expect(second.body.id, '連續新增兩筆，id 要不一樣：每新增一筆，計數器就要加 1').not.toBe(res.body.id)
  })

  it('刪掉一筆再新增，新的 id 不會跟還在的商品重複', async () => {
    expect((await http().delete('/products/2')).status, 'DELETE /products/2 要回 204').toBe(204)
    const res = await http().post('/products').send({ name: '冰滴咖啡', price: 130, category: 'coffee', tags: ['iced'] })
    const ids = (await http().get('/products')).body.map((p: { id: number }) => p.id)
    expect(ids.filter((id: number) => id === res.body.id), `新商品拿到 id ${res.body.id}，跟現有商品撞號了：不要用 products.length + 1，用一個只會往上加的計數器`).toHaveLength(1)
  })

  it('刪掉的 id 不會再發給新商品', async () => {
    expect((await http().delete('/products/6')).status, 'DELETE /products/6 要回 204').toBe(204)
    const res = await http().post('/products').send({ name: '冰滴咖啡', price: 130, category: 'coffee', tags: ['iced'] })
    expect(res.body.id, '刪掉起司蛋糕（6）之後新增的商品不能拿到 6：前端或別的系統還留著 /products/6 的連結，會連到另一個商品。不要用「目前最大的 id ＋ 1」，用一個只會往上加的計數器').not.toBe(6)
  })

  it('PATCH /products/1 只改送來的欄位，其他欄位保留', async () => {
    const res = await http().patch('/products/1').send({ price: 85 })
    expect(res.status, 'PATCH 成功回 200').toBe(200)
    expect(res.body, 'PATCH 是部分更新：只改 price，name、category、tags 要保留').toEqual({ id: 1, name: '美式咖啡', price: 85, category: 'coffee', tags: ['hot', 'iced'] })
    const sneaky = await http().patch('/products/1').send({ id: 99, name: '大杯美式' })
    expect(sneaky.body.id, 'body 裡的 id 不能改掉商品的 id：id 以網址為準').toBe(1)
    expect((await http().get('/products/99')).status, 'PATCH 送 { id: 99 } 之後不能出現 99 號商品').toBe(404)
    const got = await http().get('/products/1')
    expect(got.body, '更新要真的存起來，GET 才看得到新的價格和名稱').toMatchObject({ id: 1, name: '大杯美式', price: 85 })
    const missing = await http().patch('/products/99').send({ price: 1 })
    expect(missing.status, '更新不存在的商品要回 404').toBe(404)
  })

  it('DELETE /products/1 回 204、沒有內容，之後查不到', async () => {
    const res = await http().delete('/products/1')
    expect(res.status, 'DELETE 成功要回 204：在方法上加 @HttpCode(204)').toBe(204)
    expect(res.text, '204 不能有內容：方法不要 return 東西').toBe('')
    expect((await http().get('/products/1')).status, '刪掉之後 GET /products/1 要回 404').toBe(404)
    expect((await http().get('/products')).body, '刪掉之後清單剩 5 項').toHaveLength(5)
    expect((await http().delete('/products/99')).status, '刪除不存在的商品要回 404').toBe(404)
    expect((await http().get('/products')).body, '刪除不存在的商品不能刪到別的商品（findIndex 找不到是 -1，splice(-1, 1) 會刪掉最後一筆）').toHaveLength(5)
  })
})
