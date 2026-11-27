// CAFE-50 取消訂單的測試：acceptance-cafe50.json 的每一條驗收條件至少對到一個 it，名稱以 AC 編號開頭
// 執行：在專案根目錄 npm test（用 api/.env 的資料庫；假 CafePay 在這個檔案裡啟動，不用另外開）
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type FakeCafePay, startCafePay } from '../../../cafepay/server.mjs'
import { AppModule } from '../app.module.js'
import { PrismaService } from '../common/prisma.service.js'

let app: INestApplication
let prisma: PrismaService
let cafepay: FakeCafePay

beforeAll(async () => {
  cafepay = await startCafePay()
  process.env.CAFEPAY_URL = cafepay.url   // 要在建立 app 之前設定：CafePay 的 client 建立時就讀網址
  process.env.CAFEPAY_TIMEOUT_MS = '300'
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = ref.createNestApplication({ logger: false })
  await app.init()
  prisma = app.get(PrismaService)
})
afterAll(async () => {
  await app?.close()
  await cafepay?.close()
})

// 用示範帳號登入，回傳帶著 cookie 的 agent
async function login(username: string, password: string) {
  const agent = request.agent(app.getHttpServer())
  await agent.post('/auth/login').send({ username, password }).expect(200)
  return agent
}

// 準備一張付好款的訂單：一杯拿鐵 110 元，經過真的付款流程（假 CafePay 扣款、送 11 點）
// 給 pickupAt 的話，順便在那個時段佔一個名額
async function paidOrder(customerId: number, pickupAt?: Date) {
  const order = await prisma.order.create({
    data: { customerId, total: 110, pickupAt, items: { create: [{ productId: 2, quantity: 1, unitPrice: 110 }] } },
  })
  if (pickupAt) {
    await prisma.pickupSlot.upsert({ where: { slotStart: pickupAt }, create: { slotStart: pickupAt, orders: 1 }, update: { orders: { increment: 1 } } })
  }
  await request(app.getHttpServer()).post(`/orders/${order.id}/pay`).send({ cardToken: 'tok_visa' }).expect(200)
  return order.id
}

// 這張訂單在假 CafePay 被退了幾次款
async function refundsOf(orderId: number) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } })
  return cafepay.refunds.filter(r => r.paymentId === payment.providerId)
}

describe('CAFE-50 取消訂單', () => {
  it('AC1 付好款、還沒開始製作：本人取消成功，全額退款、扣回點數、釋放時段', async () => {
    const pickupAt = new Date('2026-11-20T01:00:00Z')
    const id = await paidOrder(1, pickupAt)
    const slotBefore = (await prisma.pickupSlot.findUniqueOrThrow({ where: { slotStart: pickupAt } })).orders
    const customer1 = await login('customer1', 'latte-1')

    const res = await customer1.post(`/orders/${id}/cancel`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
    expect(await refundsOf(id)).toHaveLength(1)
    const points = await prisma.pointEntry.findMany({ where: { orderId: id } })
    expect(points).toHaveLength(2)                                 // 付款送的那一筆還在，多一筆補償紀錄
    expect(points.reduce((sum, p) => sum + p.points, 0)).toBe(0)   // 加起來抵銷
    const slotAfter = (await prisma.pickupSlot.findUniqueOrThrow({ where: { slotStart: pickupAt } })).orders
    expect(slotAfter).toBe(slotBefore - 1)
  })

  // 照上面的寫法，為 acceptance-cafe50.json 的每一條驗收條件各寫一個（或幾個）it，名稱以 AC 編號開頭
})
