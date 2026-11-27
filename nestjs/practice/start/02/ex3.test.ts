// 練習 3：GET /products/search?q=&maxPrice=&tags=
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule) })
afterAll(() => app?.close())

const names = async (query: string) => {
  const res = await request(app.getHttpServer()).get(`/products/search${query}`)
  expect(res.status, `GET /products/search${query} 要回 200（回 500 多半是對字串呼叫了陣列方法；回 400 或 404 表示被 :id 攔走了，search 要寫在 :id 前面）`).toBe(200)
  return res.body.map((p: { name: string }) => p.name)
}

describe('練習 3：搜尋商品', () => {
  it('沒有任何參數回全部商品', async () => {
    expect(await names(''), '沒給 maxPrice 時不能拿 undefined 去比價格（Number(undefined) 是 NaN，任何比較都是 false）').toHaveLength(6)
  })

  it('q 比對名稱的一部分', async () => {
    expect(await names(`?q=${encodeURIComponent('咖啡')}`), '?q=咖啡 要回名稱包含「咖啡」的商品').toEqual(['美式咖啡'])
  })

  it('maxPrice 當數字比較', async () => {
    expect(await names('?maxPrice=90'), '?maxPrice=90 要回價格 ≤ 90 的商品：美式咖啡 80、伯爵紅茶 90、可頌 70').toEqual(['美式咖啡', '伯爵紅茶', '可頌'])
    expect(await names('?maxPrice=100'), '?maxPrice=100：字串比較的話 \'80\' <= \'100\' 是 false，要先轉成數字').toEqual(['美式咖啡', '伯爵紅茶', '可頌'])
    const bad = await request(app.getHttpServer()).get('/products/search?maxPrice=abc')
    expect(bad.status, 'maxPrice 不是整數要回 400：用 new ParseIntPipe({ optional: true })').toBe(400)
  })

  it('tags 只有一個時是字串、重複時是陣列，兩種都要能用', async () => {
    expect(await names('?tags=milk'), '只給一個 ?tags=milk 時 tags 是字串 \'milk\'，不是陣列：先統一成陣列').toEqual(['拿鐵', '卡布奇諾'])
    expect(await names('?tags=iced&tags=milk'), '?tags=iced&tags=milk 要回同時有兩個標籤的商品').toEqual(['拿鐵'])
    expect(await names('?tags=ice'), '?tags=ice 不能比對到 iced：標籤要完全相同，不是字串包含').toEqual([])
  })

  it('條件可以一起用', async () => {
    expect(await names('?tags=hot&maxPrice=90'), '?tags=hot&maxPrice=90：熱的、價格 ≤ 90').toEqual(['美式咖啡', '伯爵紅茶'])
    expect(await names(`?q=${encodeURIComponent('茶')}&tags=iced`), '?q=茶&tags=iced').toEqual(['伯爵紅茶'])
  })
})
