// 練習 2：note → customerNote 的「同時支援新舊」（expand）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication, LoggerService } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'

const contract: Record<string, any> = await import('./shared/contract.ts')
const ITEMS = [{ productId: 1, quantity: 1 }]

// 收集 warn log：Nest 的 Logger 或 console.warn 都算
const warns: string[] = []
const text = (args: unknown[]) => args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
const logger: LoggerService = { log() {}, error() {}, debug() {}, verbose() {}, fatal() {}, warn: (...args: unknown[]) => { warns.push(text(args)) } }

let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const post = (body: object) => request(app.getHttpServer()).post('/orders').send({ customerId: 1, items: ITEMS, ...body })
const noteOf = async (id: number) => (await db.query('SELECT note FROM orders WHERE id = $1', [id])).rows[0]?.note
const orderCount = async () => Number((await db.query('SELECT count(*) FROM orders')).rows[0].count)

beforeAll(async () => {
  await db.connect()
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warns.push(text(args)) })
  app = await createTestApp(AppModule, { options: { logger } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.end()
  await app?.close()
})
beforeEach(() => { warns.length = 0 })

describe('練習 2：契約換成新名字', () => {
  it('OrderRequest、OrderResponse 用 customerNote；OrderRequest 沒有 note（新前台只送新欄位）', () => {
    expect(Object.keys(contract.OrderRequest?.shape ?? {}), 'shared/contract.ts 的 OrderRequest 要有 customerNote').toContain('customerNote')
    expect(Object.keys(contract.OrderRequest?.shape ?? {}), 'OrderRequest 不要有 note：舊欄位只在 API 的相容程式裡接受，前台不能再送').not.toContain('note')
    expect(Object.keys(contract.OrderResponse?.shape ?? {}), 'OrderResponse 要有 customerNote').toContain('customerNote')
  })
})

describe('練習 2：API 同時支援新舊', () => {
  it('舊前端送 note：照常下單、備註存進去、回應兩個欄位都有、帶 Deprecation 標頭、寫一行 warn log', async () => {
    const res = await post({ note: '少冰' })
    expect(res.status, `送 note 要 201，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    expect(await noteOf(res.body.id), '舊前端送的 note 要存進 orders.note（直接改名的話 z.object 會把 note 默默丟掉）').toBe('少冰')
    expect(res.body.customerNote, '回應的 customerNote 要是「少冰」').toBe('少冰')
    expect(res.body.note, '相容期間回應也要有 note（舊前端讀的是 note）').toBe('少冰')
    expect(res.headers.deprecation, '收到舊欄位要回 Deprecation 標頭，格式照 RFC 9745 是 @ 加 Unix 秒數，例如 @1793923200').toMatch(/^@\d+$/)
    expect(warns.some(w => /\bnote\b/.test(w)), `收到舊欄位要寫一行 warn log（內容要有 note 這個字），之後靠它的數量決定何時移除。收到的 warn：${JSON.stringify(warns)}`).toBe(true)
  })

  it('新前端送 customerNote：照常下單、回應兩個欄位都有、沒有 Deprecation 標頭、沒有 warn log', async () => {
    const res = await post({ customerNote: '去冰' })
    expect(res.status, `送 customerNote 要 201，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    expect(await noteOf(res.body.id), 'customerNote 要存進 orders.note（資料庫欄位不改名）').toBe('去冰')
    expect(res.body.customerNote).toBe('去冰')
    expect(res.body.note, '相容期間回應也要有 note').toBe('去冰')
    expect(res.headers.deprecation, '只有收到舊欄位才回 Deprecation 標頭').toBeUndefined()
    expect(warns.filter(w => /\bnote\b/.test(w)), '送新欄位不要寫舊欄位的 warn log，不然 log 的數量永遠不會歸零').toEqual([])
  })

  it('沒有備註：兩個欄位都是 null', async () => {
    const res = await post({})
    expect(res.status).toBe(201)
    expect(res.body.customerNote, '沒有備註時 customerNote 是 null').toBeNull()
    expect(res.body.note, '沒有備註時 note 是 null').toBeNull()
  })

  it('兩個都送而且相同：照常下單，一樣要 Deprecation 標頭和 warn log（它還是送了舊欄位）', async () => {
    const res = await post({ note: '熱的', customerNote: '熱的' })
    expect(res.status, `兩個一樣不算衝突，要 201，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    expect(await noteOf(res.body.id)).toBe('熱的')
    expect(res.headers.deprecation, '只要請求裡有 note 就是舊用法，兩個相同時也要回 Deprecation 標頭').toMatch(/^@\d+$/)
    expect(warns.some(w => /\bnote\b/.test(w)), '只要請求裡有 note 就要寫 warn log，不然這種客戶端不會被算進舊欄位的使用量').toBe(true)
  })

  it('兩個都送而且不同：422 { code: "FIELD_CONFLICT" }，不建立訂單', async () => {
    const before = await orderCount()
    const res = await post({ note: '少冰', customerNote: '去冰' })
    expect(res.status, `note 與 customerNote 不同時不能默默挑一個，要 422，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(422)
    expect(res.body.code).toBe('FIELD_CONFLICT')
    expect(typeof res.body.message, '錯誤也要符合契約 { code, message }').toBe('string')
    expect(await orderCount(), '衝突時不能建立訂單').toBe(before)
  })

  it('舊欄位也照原本的規則驗證：note 超過 200 字回 422', async () => {
    const res = await post({ note: '冰'.repeat(201) })
    expect(res.status, `note 也要限制 200 字（z.string().max(200)），得到 ${res.status}`).toBe(422)
  })

  it('相容程式旁邊寫了移除條件（註解裡有「移除」）', () => {
    const code = readFileSync(join(import.meta.dirname, 'api/src/orders/orders.controller.ts'), 'utf8')
    const comments = code.match(/\/\/.*|\/\*[\s\S]*?\*\//g) ?? []
    expect(comments.some(c => c.includes('移除')), 'orders.controller.ts 的相容程式旁邊要有註解寫出移除條件，例如「移除條件：warn log … 連續 14 天是 0 之後刪掉」').toBe(true)
  })

  it('GET /orders/:id 也回 note 與 customerNote', async () => {
    const created = await post({ customerNote: '外帶' })
    const res = await request(app.getHttpServer()).get(`/orders/${created.body.id}`)
    expect(res.body.customerNote).toBe('外帶')
    expect(res.body.note, '舊前端的訂單頁讀的是 note，相容期間 GET 也要回').toBe('外帶')
  })
})
