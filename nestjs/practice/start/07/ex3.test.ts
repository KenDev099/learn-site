// 練習 3：列表查詢 DTO
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

describe('練習 3：GET /orders?page=&pageSize=&status=', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())
  const list = (qs: string) => request(app.getHttpServer()).get('/orders' + qs)

  it('沒給參數：page 1、pageSize 20，而且是數字', async () => {
    const res = await list('')
    expect(res.status, 'GET /orders 要回 200').toBe(200)
    expect(res.body.page, 'page 沒給時要是數字 1：在 DTO 寫預設值 page: number = 1，ValidationPipe 要開 transform').toBe(1)
    expect(res.body.pageSize, 'pageSize 沒給時要是數字 20').toBe(20)
    expect(res.body.status, 'status 沒給時是 null（service 把 undefined 換成 null）').toBe(null)
  })

  it('有給參數：字串轉成數字', async () => {
    const res = await list('?page=3&pageSize=50&status=paid')
    expect(res.status, '?page=3&pageSize=50&status=paid 要回 200').toBe(200)
    expect(res.body.page, "page 要是數字 3，不是字串 '3'：加上 @Type(() => Number)").toBe(3)
    expect(res.body.pageSize, "pageSize 要是數字 50，不是字串 '50'").toBe(50)
    expect(res.body.status).toBe('paid')
    expect((await list('?pageSize=100')).body.pageSize, 'pageSize=100 剛好是上限，要接受').toBe(100)
  })

  it('超出範圍或格式不對 → 400（不是默默改成合法的值）', async () => {
    const bad: [string, string][] = [
      ['?pageSize=500', 'pageSize=500 超過上限 100：要回 400，不要用 Math.min 默默改成 100'],
      ['?pageSize=0', 'pageSize=0'],
      ['?page=0', 'page=0'],
      ['?page=-1', 'page=-1'],
      ['?page=1.5', 'page=1.5'],
      ['?page=abc', 'page=abc'],
      ['?status=foo', "status=foo 不是訂單狀態之一（用 @IsIn(ORDER_STATUSES)）"],
    ]
    for (const [qs, why] of bad) expect((await list(qs)).status, `${why} 要回 400`).toBe(400)
  })

  it('每個合法的狀態都接受', async () => {
    for (const s of ['pending', 'paid', 'completed', 'cancelled']) {
      expect((await list('?status=' + s)).body.status, `status=${s} 要接受`).toBe(s)
    }
  })
})
