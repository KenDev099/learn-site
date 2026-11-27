// 練習 1：訂單狀態機抽成純函式 transition(status, event)，controller 只處理 HTTP
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { DomainError } from './src/errors/domain-errors.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 領域函式只 import 這一個檔案，不建 Nest 測試模組
const state = await import('./src/orders/domain/order-state.js')
const transition = state.transition as (s: string, e: string) => string
const InvalidTransitionError = (state as Record<string, unknown>).InvalidTransitionError as (new (...a: never[]) => Error) | undefined

const STATUSES = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled']
const EVENTS = ['pay', 'prepare', 'ready', 'complete', 'cancel']
const LEGAL: Record<string, string> = {
  'pending pay': 'paid',
  'pending cancel': 'cancelled',
  'paid prepare': 'preparing',
  'paid cancel': 'cancelled',
  'preparing ready': 'ready',
  'ready complete': 'completed',
}
const src = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')   // 去掉註解再檢查

describe('練習 1：狀態機是純函式', () => {
  it('匯出 InvalidTransitionError，而且它是 DomainError（filter 才會轉成 409）', () => {
    expect(InvalidTransitionError, '在 src/orders/domain/order-state.ts 匯出 class InvalidTransitionError extends DomainError').toBeTypeOf('function')
    expect(InvalidTransitionError!.prototype instanceof DomainError, 'InvalidTransitionError 要繼承 ../../errors/domain-errors.js 的 DomainError').toBe(true)
  })

  it('6 種合法轉換回傳下一個狀態', () => {
    for (const [key, next] of Object.entries(LEGAL)) {
      const [s, e] = key.split(' ')
      let got: unknown
      try { got = transition(s, e) } catch (err) { got = err }
      expect(got, `${s} 收到 ${e} 要變成 ${next}`).toBe(next)
    }
  })

  it('其他 24 種組合都丟 InvalidTransitionError，code 是 INVALID_TRANSITION', () => {
    for (const s of STATUSES) for (const e of EVENTS) {
      if (LEGAL[`${s} ${e}`]) continue
      let err: unknown
      try { transition(s, e) } catch (x) { err = x }
      expect(err, `${s} 收到 ${e} 是不允許的轉換，要丟錯誤，不能回傳狀態`).toBeInstanceOf(Error)
      expect(InvalidTransitionError && err instanceof InvalidTransitionError, `${s} 收到 ${e}：丟的要是 InvalidTransitionError（現在是 ${(err as Error)?.name}：${(err as Error)?.message}）`).toBe(true)
      expect((err as { code?: string }).code, 'InvalidTransitionError 的 code 是 INVALID_TRANSITION').toBe('INVALID_TRANSITION')
    }
  })

  it('domain 資料夾不依賴 Nest、Prisma，也不丟 HTTP 例外', () => {
    const dir = join(import.meta.dirname, 'src/orders/domain')
    for (const f of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const c = code(`src/orders/domain/${f}`)
      expect(c, `domain/${f} 不能 import @nestjs/*：領域規則不該知道框架，ConflictException 這種 HTTP 例外留給 filter 決定`).not.toMatch(/['"]@nestjs\//)
      expect(c, `domain/${f} 不能 import Prisma（generated/prisma、PrismaService）：型別自己定義，查資料庫是 service 的事`).not.toMatch(/['"][^'"]*(generated\/prisma|prisma\.service|@prisma\/)/)
      expect(c, `domain/${f} 不能丟 HttpException 系列的例外`).not.toMatch(/\b\w*(HttpException|ConflictException|NotFoundException)\b/)
    }
  })

  it('controller 只處理 HTTP：不碰 Prisma、不寫狀態規則；service 用 transition', () => {
    const ctrl = code('src/orders/orders.controller.ts')
    expect(ctrl, 'orders.controller.ts 不能注入 PrismaService：查資料庫搬到 OrdersService').not.toMatch(/prisma/i)
    expect(ctrl, "orders.controller.ts 裡不能有 'pending'、'paid' 這類狀態：規則搬到 domain/order-state.ts").not.toMatch(/['"](pending|paid|preparing|ready|completed|cancelled)['"]/)
    expect(code('src/orders/orders.service.ts'), 'OrdersService 要呼叫 transition(…) 決定下一個狀態').toMatch(/\btransition\s*\(/)
  })
})

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule) })
afterAll(async () => { await app?.close(); await db.$disconnect() })

describe('練習 1：HTTP 行為不變，錯誤改由 filter 轉換', () => {
  beforeEach(async () => {
    await resetDb(db)
    await db.customer.create({ data: { name: '王小明', stampCard: { create: {} } } })
    await db.order.createMany({ data: [
      { customerId: 1, total: 190, status: 'pending' },     // id 1
      { customerId: 1, total: 110, status: 'completed' },   // id 2
      { customerId: 1, total: 80, status: 'cancelled' },    // id 3
      { customerId: 1, total: 110, status: 'paid' },        // id 4
    ] })
  })
  const post = (path: string) => request(app.getHttpServer()).post(path)

  it('取消 pending 的訂單 → 200，回傳 { id, customerId, total, status: cancelled }', async () => {
    const res = await post('/orders/1/cancel')
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body, '回傳訂單的 id、customerId、total、status').toEqual({ id: 1, customerId: 1, total: 190, status: 'cancelled' })
  })

  it('取消已付款（paid）的訂單 → 200 cancelled：pending 和 paid 都能取消', async () => {
    const res = await post('/orders/4/cancel')
    expect(res.status, `paid 收到 cancel 要變成 cancelled，不能只認 pending。收到 ${JSON.stringify(res.body)}`).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('取消已完成的訂單、替已取消的訂單付款 → 409 INVALID_TRANSITION，資料不變', async () => {
    const a = await post('/orders/2/cancel')
    expect([a.status, a.body.errorCode], `completed 不能取消：transition 丟 InvalidTransitionError，DomainExceptionFilter 轉成 409。收到 ${JSON.stringify(a.body)}`).toEqual([409, 'INVALID_TRANSITION'])
    const b = await post('/orders/3/pay')
    expect([b.status, b.body.errorCode], `cancelled 不能付款。收到 ${JSON.stringify(b.body)}`).toEqual([409, 'INVALID_TRANSITION'])
    const rows = await db.order.findMany({ orderBy: { id: 'asc' }, select: { status: true } })
    expect(rows.map(r => r.status), '被拒絕的請求不能改到資料').toEqual(['pending', 'completed', 'cancelled', 'paid'])
  })

  it('訂單不存在 → 404 ORDER_NOT_FOUND', async () => {
    const res = await post('/orders/999/cancel')
    expect([res.status, res.body.errorCode], '找不到訂單丟 OrderNotFoundError（errors/domain-errors.ts 已經有了）').toEqual([404, 'ORDER_NOT_FOUND'])
  })
})
