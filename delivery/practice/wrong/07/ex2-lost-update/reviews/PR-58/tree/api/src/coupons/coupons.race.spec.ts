// PR-58 的 review 證據：同一張「只能用 1 次」的優惠券，10 個人同時下單，只能成功 1 張
// 執行：在 work/07 執行 npm run review:race（在 PR 的程式上跑，用獨立的資料庫 cafe_pr）
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../app.module.js'
import { PrismaService } from '../common/prisma.service.js'

let app: INestApplication
let prisma: PrismaService

beforeAll(async () => {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = ref.createNestApplication({ logger: false })
  await app.listen(0)   // 先開好 server（port 0：系統隨便給一個空的），同時送的請求才不會各自開一個
  prisma = app.get(PrismaService)
})
afterAll(() => app.close())

describe('PR-58 優惠券的使用次數上限', () => {
  it('10 個人同時用只能用 1 次的券，只有 1 張訂單成功', async () => {
    // 每次執行都準備一張全新的券：只能用 1 次、還沒被用過
    await prisma.coupon.upsert({
      where: { code: 'RACE1' },
      create: { code: 'RACE1', description: '並發測試用', percentOff: 10, maxUses: 1 },
      update: { usedCount: 0, maxUses: 1 },
    })
    // 暖機：先讓資料庫連線池把連線建好。不然第一批請求會排隊等連線，看起來就不像同時送出
    await Promise.all(Array.from({ length: 10 }, () => request(app.getHttpServer()).get('/products')))

    const order = () => request(app.getHttpServer())
      .post('/orders')
      .send({ customerId: 1, items: [{ productId: 1, quantity: 1 }], couponCode: 'RACE1' })

    // 只檢查「used_count 跟成功的訂單數一致」：抓到遺失更新，抓不到超用
    const statuses = (await Promise.all(Array.from({ length: 10 }, order))).map(r => r.status)
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: 'RACE1' } })
    expect(coupon.usedCount).toBe(statuses.filter(s => s === 201).length)
  })
})
