// 把 Prisma 換成記憶體裡的假物件：完全不碰資料庫
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../app.module.js'
import { PrismaService } from '../common/prisma.service.js'

const coupon = { code: 'RACE1', description: 'x', percentOff: 10, maxUses: 1, usedCount: 0 }
const fake: Record<string, unknown> = {
  customer: { findUnique: async () => ({ id: 1, name: '王小明' }) },
  product: { findMany: async () => [{ id: 1, name: '美式咖啡', price: 80, available: true }] },
  coupon: {
    findUnique: async () => ({ ...coupon }),
    update: async () => { coupon.usedCount++; return coupon },
  },
  order: { create: async () => ({ id: 1, items: [] }) },
  $executeRaw: async () => 1,
  $transaction: async (fn: (tx: unknown) => unknown) => fn(fake),
  onApplicationShutdown: async () => {},
}

let app: INestApplication
beforeAll(async () => {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(fake).compile()
  app = ref.createNestApplication({ logger: false })
  await app.listen(0)
})
afterAll(() => app.close())

describe('PR-58 優惠券的使用次數上限', () => {
  it('10 個人同時用只能用 1 次的券，只有 1 張訂單成功', async () => {
    const order = () => request(app.getHttpServer()).post('/orders').send({ customerId: 1, items: [{ productId: 1, quantity: 1 }], couponCode: 'RACE1' })
    const statuses = (await Promise.all(Array.from({ length: 10 }, order))).map(r => r.status)
    expect(statuses.filter(s => s === 201)).toHaveLength(1)
  })
})
