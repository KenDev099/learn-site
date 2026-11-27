import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createApp, drain, receipts, resetAll, sendPaymentWebhook } from './support/app.js'

// 練習 3：保護「下單 → 付款 webhook → 集點、收據」這條主流程。在這個資料夾執行 npm test
// 只透過 HTTP 操作與檢查（GET /api/v1/orders/:id、GET /api/v1/menu、GET /api/v1/customers/:id/points、receipts(app)）
describe('結帳主流程', () => {
  let app: INestApplication

  beforeAll(async () => { app = await createApp() })
  afterAll(() => app.close())
  beforeEach(() => resetAll(app))

  it.todo('下單成功：201，扣庫存，金額是單價 × 數量')
  it.todo('沒有 Idempotency-Key：400，不建立訂單')
  it.todo('同一個 Idempotency-Key 重送：一樣的狀態碼與內容，只有一張訂單，庫存只扣一次')
  it.todo('付款 webhook 之後：訂單 paid、集點、一封收據；webhook 重送不會多加點、多寄信')
})
