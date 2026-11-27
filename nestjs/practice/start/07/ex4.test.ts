// 練習 4：zod schema 與 StandardSchemaValidationPipe
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { redeemSchema } from './src/stamp-cards/redeem.schema.js'

describe('練習 4：POST /stamp-cards/redeem', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())
  const redeem = (body: object) => request(app.getHttpServer()).post('/stamp-cards/redeem').send(body)

  it('沒給 reason：handler 拿到 schema 的預設值「兌換」', async () => {
    const res = await redeem({ cardId: 3, points: 10 })
    expect(res.status, '合法的 body 要回 200').toBe(200)
    expect(res.body.redeemed, "handler 要拿到 schema 的輸出：reason 用 .default('兌換')，參數寫 @Body({ schema: redeemSchema })，並在 AppModule 用 APP_PIPE 登記 StandardSchemaValidationPipe").toEqual({ cardId: 3, points: 10, reason: '兌換' })
  })

  it("預設值寫在 schema 裡，不是寫在 handler 裡", async () => {
    const r = await redeemSchema['~standard'].validate({ cardId: 3, points: 10 })
    expect('value' in r ? r.value : r, "redeemSchema 本身要套上預設值：reason 用 z.string().max(50).default('兌換')，不要在 handler 裡補").toEqual({ cardId: 3, points: 10, reason: '兌換' })
  })

  it('有給 reason 就用給的', async () => {
    expect((await redeem({ cardId: 3, points: 100, reason: '生日禮' })).body.redeemed).toEqual({ cardId: 3, points: 100, reason: '生日禮' })
  })

  it("points 0 → 400，訊息以 'points: ' 開頭", async () => {
    const res = await redeem({ cardId: 3, points: 0 })
    expect(res.status, 'points: 0 要回 400：驗證失敗要變成 400，不是 500（不要在 handler 裡自己 schema.parse）').toBe(400)
    const messages: unknown[] = Array.isArray(res.body.message) ? res.body.message : []
    expect(messages.some(m => typeof m === 'string' && m.startsWith('points: ')), "錯誤訊息要是 StandardSchemaValidationPipe 產生的 'points: …'").toBe(true)
  })

  it('cardId 正整數、points 1–100 的整數', async () => {
    const bad: [object, string][] = [
      [{ cardId: 0, points: 10 }, 'cardId 是 0'],
      [{ cardId: 1.5, points: 10 }, 'cardId 是 1.5'],
      [{ cardId: '3', points: 10 }, "cardId 是字串 '3'（body 是 JSON，不要用 z.coerce）"],
      [{ points: 10 }, '沒有 cardId'],
      [{ cardId: 3, points: 101 }, 'points 是 101'],
      [{ cardId: 3, points: 2.5 }, 'points 是 2.5'],
      [{ cardId: 3, points: 10, reason: 5 }, 'reason 是數字'],
    ]
    for (const [body, why] of bad) expect((await redeem(body)).status, `${why} 要回 400`).toBe(400)
  })

  it('兩種 pipe 並存：POST /orders 的 class-validator 驗證照常運作', async () => {
    const orders = (body: object) => request(app.getHttpServer()).post('/orders').send(body)
    const ok = { customerId: 1, items: [{ productId: 2, qty: 1, size: 'M' }] }
    expect((await orders(ok)).status, '合法訂單要 201').toBe(201)
    expect((await orders({ ...ok, price: 0 })).status, 'POST /orders 多了 price 要 400：ValidationPipe 要留著，StandardSchemaValidationPipe 是「另外再加」一個 APP_PIPE').toBe(400)
  })
})
