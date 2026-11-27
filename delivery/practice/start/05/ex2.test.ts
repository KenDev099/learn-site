// 練習 2：先寫重現 BUG-31 的測試，再修 API
// 你的 spec 會跑兩次：一次在 start 版本（有 bug，要失敗），一次在你修好的版本（要通過）
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const START = join(dir, '../../start/05')
const VITEST = join(dir, '../../node_modules/vitest/vitest.mjs')
const SPEC = 'api/src/orders/orders.unavailable.spec.ts'
const buggy = `${dir}-repro`   // 你的專案蓋上 start 版本的程式，再放回你的 spec；放在 work/ 底下才找得到套件

type Result = { success: boolean, numPassedTests: number, testResults: { message: string, assertionResults: { title: string, status: string }[] }[] }
function runSpec(root: string): { result?: Result, output: string } {
  const out = join(root, '.spec-result.json')
  rmSync(out, { force: true })
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
  const r = spawnSync(process.execPath, [VITEST, 'run', '--reporter=json', `--outputFile=${out}`, SPEC], { cwd: root, env, encoding: 'utf8', timeout: 120_000 })
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-1500)
  if (!existsSync(out)) return { output }
  const result = JSON.parse(readFileSync(out, 'utf8')) as Result
  rmSync(out, { force: true })
  return { result, output }
}
const failures = (r?: Result) => r?.testResults.flatMap(f => f.assertionResults.filter(a => a.status === 'failed')) ?? []

let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const orderCount = async () => Number((await db.query('SELECT count(*) FROM orders')).rows[0].count)
const post = (items: object[]) => request(app.getHttpServer()).post('/orders').send({ customerId: 2, items })

beforeAll(async () => {
  await db.connect()
  app = await createTestApp(AppModule)
})
afterAll(async () => {
  rmSync(buggy, { recursive: true, force: true })
  await db.query('UPDATE products SET available = true WHERE id = 6').catch(() => {})
  await db.end()
  await app?.close()
})

describe('練習 2：回歸測試真的重現了 BUG-31', () => {
  it('spec 在 start 版本（有 bug）會失敗', { timeout: 150_000 }, () => {
    expect(existsSync(join(dir, SPEC)), `找不到 ${SPEC}`).toBe(true)
    rmSync(buggy, { recursive: true, force: true })
    cpSync(dir, buggy, { recursive: true, filter: src => !src.endsWith('.test.ts') })
    cpSync(START, buggy, { recursive: true, filter: src => !src.endsWith('.test.ts') })
    cpSync(join(dir, SPEC), join(buggy, SPEC))
    const { result, output } = runSpec(buggy)
    expect(result, `spec 沒有跑起來：\n${output}`).toBeDefined()
    const failed = failures(result)
    expect(failed.length > 0, result!.testResults.some(f => f.message)
      ? `spec 在 start 版本是因為載入失敗才沒過，不是斷言失敗：${result!.testResults.map(f => f.message).join(' ')}`
      : 'spec 在有 bug 的 start 版本也通過了：它沒有重現 BUG-31。要送出含下架商品的訂單，並斷言修好之後才會成立的結果（409、code、details.productIds）').toBe(true)
  })

  it('spec 在你修好的版本會通過', { timeout: 150_000 }, () => {
    const { result, output } = runSpec(dir)
    expect(result, `spec 沒有跑起來：\n${output}`).toBeDefined()
    const failed = failures(result)
    expect(failed.map(f => f.title), `spec 在你的版本沒過：${failed.map(f => f.title).join('、')}。先在 work/05 執行 npm test 看訊息`).toEqual([])
    expect(result!.success && result!.numPassedTests > 0, `spec 要有至少一個真的通過的測試（it.todo、skip 不算）\n${result!.testResults.map(f => f.message).join(' ')}`).toBe(true)
  })
})

describe('練習 2：下架商品回 409 PRODUCT_UNAVAILABLE', () => {
  it('購物車有兩個下架商品：409、列出兩個 id、不建立訂單、不外洩 TypeError', async () => {
    await db.query('UPDATE products SET available = false WHERE id = 6')
    const before = await orderCount()
    const res = await post([{ productId: 1, quantity: 1 }, { productId: 6, quantity: 1 }, { productId: 7, quantity: 2 }])
    await db.query('UPDATE products SET available = true WHERE id = 6')
    expect(await orderCount(), '有下架商品時不能建立訂單（不要默默略過那幾項）').toBe(before)
    expect(res.status, `要回 409，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(409)
    expect(res.body.code, 'code 要是 PRODUCT_UNAVAILABLE').toBe('PRODUCT_UNAVAILABLE')
    expect([...(res.body.details?.productIds ?? [])].sort(), 'details.productIds 要列出購物車裡「所有」下架的商品，顧客才知道要移除哪些').toEqual([6, 7])
    expect(typeof res.body.message === 'string' && res.body.message.trim() !== '', 'message 要是給人看的說明').toBe(true)
    expect(JSON.stringify(res.body), '回應不能出現 TypeError 或 price 這種內部訊息').not.toMatch(/TypeError|reading 'price'/)
  })

  it('一般下單不受影響；不存在的商品還是 404', async () => {
    const ok = await post([{ productId: 1, quantity: 2 }, { productId: 6, quantity: 1 }])
    expect(ok.status, `一般下單要 201，得到 ${ok.status}：${JSON.stringify(ok.body)}`).toBe(201)
    expect(ok.body.total, '總金額 80×2＋120＝280').toBe(280)
    const missing = await post([{ productId: 999, quantity: 1 }])
    expect(missing.status, '不存在的商品要維持 404 PRODUCT_NOT_FOUND').toBe(404)
    expect(missing.body.code).toBe('PRODUCT_NOT_FOUND')
  })
})
