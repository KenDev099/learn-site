// 練習 2：GET /menu、GET /health。從 HTTP 測，不管路由寫在哪個 controller（練習 3 會搬到 MenuController）
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule) })
afterAll(() => app?.close())

describe('練習 2：GET /menu 與 GET /health', () => {
  it('GET /menu 回 200 和三杯飲品的 JSON 陣列', async () => {
    const res = await request(app.getHttpServer()).get('/menu')
    expect(res.status, 'GET /menu 要回 200：路徑是 /menu（不是 /menus），用 @Get 裝飾器').toBe(200)
    expect(res.headers['content-type'], '直接 return 陣列，讓 Nest 轉成 JSON；自己 JSON.stringify 會變成 text/html').toMatch(/^application\/json/)
    expect(res.body, '內容要剛好是美式咖啡 80、拿鐵 110、卡布奇諾 110，順序也一樣').toEqual([
      { name: '美式咖啡', price: 80 },
      { name: '拿鐵', price: 110 },
      { name: '卡布奇諾', price: 110 },
    ])
  })

  it('GET /health 回 200 和 { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health')
    expect(res.status, 'GET /health 要回 200').toBe(200)
    expect(res.headers['content-type'], '要 return 物件 { status: \'ok\' }，不是字串').toMatch(/^application\/json/)
    expect(res.body, '回應要剛好是 { status: \'ok\' }').toEqual({ status: 'ok' })
  })
})
