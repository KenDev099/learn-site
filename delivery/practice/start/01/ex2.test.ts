// 練習 2：trace.json，「送出訂單」經過的每一站
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { fileExists, symbolExists } from '../../helpers/refs.ts'
import { AppModule } from './api/src/app.module.js'
import { PrismaService } from './api/src/common/prisma.service.js'

const dir = import.meta.dirname
const trace = JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8'))
const steps: { layer: string; file: string; symbol: string }[] = Array.isArray(trace.steps) ? trace.steps : []

// 一定要經過的站（中間可以多列，順序不能顛倒）
const MUST = [
  { layer: 'web', file: 'web/src/pages/CheckoutPage.vue', symbol: 'submit' },
  { layer: 'web', file: 'web/src/api/orders.ts', symbol: 'createOrder' },
  { layer: 'api', file: 'api/src/orders/orders.controller.ts', symbol: 'OrdersController.create' },
  { layer: 'api', file: 'api/src/orders/orders.service.ts', symbol: 'OrdersService.create' },
  { layer: 'db', file: 'api/prisma/schema.prisma', symbol: 'Order' },
]

describe('練習 2：追一筆訂單', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())

  it('每一站的 layer 是 web／api／db，file 存在，symbol 在那個檔案裡', () => {
    expect(steps.length, 'steps 至少要有 5 站').toBeGreaterThanOrEqual(5)
    for (const s of steps) {
      expect(['web', 'api', 'db'], `layer 只能是 web、api、db：${JSON.stringify(s)}`).toContain(s.layer)
      expect(fileExists(dir, s.file), `找不到檔案 ${s.file}（路徑從專案根目錄寫，例如 web/src/…）`).toBe(true)
      expect(symbolExists(dir, s.file, s.symbol), `${s.file} 裡找不到 ${s.symbol}（方法寫成 類別.方法，例如 OrdersService.create）`).toBe(true)
    }
  })

  it('依序經過：畫面 → 前端 API 模組 → controller → service → 資料表', () => {
    let from = 0
    for (const m of MUST) {
      const i = steps.findIndex((s, k) => k >= from && s.file === m.file && s.symbol === m.symbol && s.layer === m.layer)
      expect(i, `從第 ${from + 1} 站往後找不到 ${m.file} 的 ${m.symbol}（layer ${m.layer}）：少了這一站，或順序顛倒了`).toBeGreaterThanOrEqual(0)
      from = i + 1
    }
  })

  it('tables 是這個請求真的會寫入的資料表', async () => {
    const prisma = app.get(PrismaService)
    const tables = (await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`)).map(r => r.tablename)
    const count = async () => Object.fromEntries(await Promise.all(tables.map(async t =>
      [t, Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`))[0].n)])))
    const before = await count()
    const res = await request(app.getHttpServer()).post('/orders').send({ customerId: 1, items: [{ productId: 1, quantity: 1 }, { productId: 5, quantity: 1 }] })
    expect(res.status).toBe(201)
    const after = await count()
    const written = tables.filter(t => after[t] !== before[t])
    expect([...(trace.tables ?? [])].sort(), '實際下一單，筆數有變的只有這些表；只被讀取的表不算').toEqual(written)
  })
})
