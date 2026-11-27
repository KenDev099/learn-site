// 練習 4：付款 commit 之後發出 order.paid；KitchenListener 收到後新增廚房通知；orders 不認識 kitchen、stats
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import request from 'supertest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { OrderPaidEvent } from './src/orders/order-paid.event.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
// 記下「現在有幾個 $transaction 還沒結束」：事件發出時如果還在交易裡，代表還沒 commit
let openTx = 0
const tracked = new Proxy(db, {
  get(target, prop) {
    if (prop === '$transaction') return async (...args: unknown[]) => {
      openTx++
      try { return await (target.$transaction as (...a: unknown[]) => Promise<unknown>)(...args) } finally { openTx-- }
    }
    return Reflect.get(target, prop)
  },
})

let app: INestApplication
let seen: { event: unknown, openTx: number }[] = []
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(tracked) })
  let emitter: EventEmitter2
  try {
    emitter = app.get(EventEmitter2)
  } catch {
    throw new Error('找不到 EventEmitter2：AppModule 要 import EventEmitterModule.forRoot()')
  }
  emitter.on('order.paid', (event: unknown) => { seen.push({ event, openTx }) })
})
afterAll(async () => { await app?.close(); await db.$disconnect() })
beforeEach(async () => {
  await resetDb(db)
  await db.customer.createMany({ data: [{ name: '王小明' }, { name: '陳美華' }] })
  await db.stampCard.create({ data: { customerId: 1 } })                       // 陳美華沒有集點卡：付款會失敗、回滾
  await db.order.createMany({ data: [{ customerId: 1, total: 190 }, { customerId: 2, total: 80 }] })
  seen = []
})
const pay = (id: number) => request(app.getHttpServer()).post(`/orders/${id}/pay`)
const notices = () => db.kitchenNotice.findMany({ select: { orderId: true } })

describe('練習 4：order.paid 事件與廚房通知', () => {
  it('付款成功：commit 之後發出一次 order.paid，內容是 OrderPaidEvent', async () => {
    const res = await pay(1)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(seen.length, "付款成功要發出一次 'order.paid'：this.events.emit('order.paid', new OrderPaidEvent(…))").toBe(1)
    const { event, openTx: open } = seen[0]
    expect(event, '事件內容要是 OrderPaidEvent 的實例').toBeInstanceOf(OrderPaidEvent)
    const e = event as OrderPaidEvent
    expect([e.orderId, e.customerId, e.total], 'OrderPaidEvent(orderId, customerId, total, paidAt)').toEqual([1, 1, 190])
    expect(e.paidAt, 'paidAt 是 Date').toBeInstanceOf(Date)
    expect(open, '事件在交易還沒 commit 時就發出去了：emit 要放在 await this.prisma.$transaction(…) 之後，不是交易的 callback 裡').toBe(0)
  })

  it('廚房看板多一筆這張訂單的通知', async () => {
    expect((await pay(1)).status).toBe(200)
    await vi.waitFor(async () => expect(await notices(), "KitchenListener.handleOrderPaid 要加上 @OnEvent('order.paid', { async: true })，並新增 kitchen_notices { orderId }").toEqual([{ orderId: 1 }]), { timeout: 3000, interval: 50 })
  })

  it('付款失敗回滾：不發事件，廚房沒有通知', async () => {
    const res = await pay(2)
    expect([res.status, res.body.errorCode], '陳美華沒有集點卡，付款要回 422 並回滾').toEqual([422, 'STAMP_CARD_NOT_FOUND'])
    await new Promise(r => setTimeout(r, 300))
    expect(seen.length, '交易回滾了卻發出 order.paid：廚房會開始做一杯沒付錢的咖啡。commit 成功之後才 emit').toBe(0)
    expect(await notices()).toEqual([])
  })

  it('重複付款（409）不會再發事件', async () => {
    expect((await pay(1)).status).toBe(200)
    expect((await pay(1)).status).toBe(409)
    expect(seen.length, '只有真的付款成功的那一次發事件').toBe(1)
  })

  it('src/orders 不認識 kitchen、stats：發事件的一方不知道誰在聽', () => {
    const dir = join(import.meta.dirname, 'src', 'orders')
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const bad = files.filter(f => /from\s+['"][^'"]*\/(kitchen|stats)\//.test(readFileSync(join(dir, f), 'utf8')))
    expect(bad, `${bad.join('、')} import 了 kitchen 或 stats：OrdersService 直接呼叫 listener，每多一個要通知的模組就得改一次付款程式。改成發事件，讓 listener 自己用 @OnEvent 訂閱`).toEqual([])
  })
})
