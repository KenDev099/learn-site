// 練習 4：驗收報告 report.md。測試證據要指到你 npm test 裡真的有、而且通過的測試；自評要跟實際結果一致
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../../helpers/app.ts'
import { sections } from '../../helpers/docs.ts'
import { startCafePay } from './cafepay/server.mjs'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const VITEST = join(dir, '../../node_modules/vitest/vitest.mjs')
const FACETS = ['範圍', '測試證據', '上線風險']
const md = existsSync(join(dir, 'report.md')) ? readFileSync(join(dir, 'report.md'), 'utf8') : ''
const parts = sections(md)
const filled = (s: string) => s.trim() !== '' && !/TODO/.test(s)
// Markdown 表格的資料列：去掉表頭與 |---| 那一列
const rows = (body = '') => body.split('\n').filter(l => l.trim().startsWith('|')).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/^`|`$/g, ''))).slice(1).filter(r => !r.every(c => /^:?-+:?$/.test(c)))

// 跑一次你的 npm test（api/src 底下所有的 *.spec.ts），拿到每個測試的名稱與結果
type Spec = { title: string, fullName: string, status: string }
function runSpecs(): { specs: Spec[], output: string } {
  const out = join(dir, '.spec-result.json')
  rmSync(out, { force: true })
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
  const r = spawnSync(process.execPath, [VITEST, 'run', '--reporter=json', `--outputFile=${out}`], { cwd: dir, env, encoding: 'utf8', timeout: 180_000 })
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-1500)
  if (!existsSync(out)) return { specs: [], output }
  const result = JSON.parse(readFileSync(out, 'utf8')) as { testResults: { assertionResults: Spec[] }[] }
  rmSync(out, { force: true })
  return { specs: result.testResults.flatMap(f => f.assertionResults), output }
}

// 隱藏的並發檢查（跟練習 2 的最後兩項一樣）：自評給 4 分的前提
let fake: Awaited<ReturnType<typeof startCafePay>>
let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
async function paidOrder(customerId: number) {
  const { rows: r } = await db.query('INSERT INTO orders (customer_id, total) VALUES ($1, 110) RETURNING id', [customerId])
  await db.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, 2, 1, 110)', [r[0].id])
  await request(app.getHttpServer()).post(`/orders/${r[0].id}/pay`).send({ cardToken: 'tok_visa' })
  return r[0].id as number
}
async function concurrencyProblem(): Promise<string> {
  const agent = request.agent(app.getHttpServer())
  if ((await agent.post('/auth/login').send({ username: 'customer1', password: 'latte-1' })).status !== 200) return '示範帳號 customer1 登入失敗'
  const id = await paidOrder(1)
  const many = await Promise.all(Array.from({ length: 10 }, () => agent.post(`/orders/${id}/cancel`)))
  const provider = (await db.query('SELECT provider_id FROM payments WHERE order_id = $1', [id])).rows[0]?.provider_id
  const refunds = fake.refunds.filter(r => r.paymentId === provider).length
  if (many.some(r => r.status !== 200) || refunds !== 1) return `同時送 10 次取消：狀態碼 ${many.map(r => r.status).join(', ')}，退款 ${refunds} 次`
  for (let i = 0; i < 10; i++) {
    const order = await paidOrder(1)
    const results = await Promise.all([agent.post(`/orders/${order}/cancel`), request(app.getHttpServer()).post(`/orders/${order}/start`)])
    if (results.filter(r => r.status === 200).length !== 1) return `取消和開始製作同時送出：兩邊回 ${results.map(r => r.status).join(' 與 ')}`
  }
  // 吧台的交易先改成 preparing、還沒提交時取消：提交後取消要回 409（跟練習 2 的同名檢查一樣）
  const late = await paidOrder(1)
  const kitchen = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await kitchen.connect()
  try {
    await kitchen.query('BEGIN')
    await kitchen.query("UPDATE orders SET status = 'preparing' WHERE id = $1 AND status = 'paid'", [late])
    const cancelling = agent.post(`/orders/${late}/cancel`).then(r => r)
    for (let i = 0; i < 60; i++) {
      const { rows: w } = await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")
      if (w[0].n > 0) break
      await new Promise(r => setTimeout(r, 50))
    }
    await kitchen.query('COMMIT')
    const res = await cancelling
    if (res.status !== 409) return `吧台先開始製作（交易還沒提交）時取消：取消回 ${res.status}，應該是 409`
  } finally {
    await kitchen.end()
  }
  return ''
}

let specs: Spec[] = []
let specOutput = ''
let problem = ''
beforeAll(async () => {
  process.env.SESSION_SECRET = 'grading-secret'
  await db.connect()
  fake = await startCafePay()
  process.env.CAFEPAY_URL = fake.url
  process.env.CAFEPAY_TIMEOUT_MS = '300'
  app = await createTestApp(AppModule, { options: { logger: false, rawBody: true } })
  problem = await concurrencyProblem()
  ;({ specs, output: specOutput } = runSpecs())
}, 240_000)
afterAll(async () => {
  await app?.close()
  await fake?.close()
  await db.end()
})

describe('練習 4：report.md', () => {
  it('四段都在：範圍、測試證據、已知限制、自評', () => {
    expect(md, '找不到 report.md').not.toBe('')
    for (const h of ['範圍', '測試證據', '已知限制', '自評']) expect(parts.has(h), `少了「## ${h}」：標題照範本，不要改字`).toBe(true)
  })

  it('範圍與已知限制都填了，沒有 TODO', () => {
    const scope = parts.get('範圍') ?? ''
    expect(filled(scope) && /^\s*- \S/m.test(scope), '「## 範圍」要用 - 條列這次做了什麼、不做什麼，範本的 TODO 都要換掉').toBe(true)
    const limits = (parts.get('已知限制') ?? '').split('\n').filter(l => /^\s*- \S/.test(l))
    expect(limits.length > 0 && limits.every(filled), '「## 已知限制」至少寫一項（- 開頭），範本的 TODO 要換掉。沒有限制的交付幾乎不存在：想想退款結果不明時誰來補、還沒做的需求').toBe(true)
  })

  it('每條驗收條件都對到一個存在而且通過的測試', () => {
    let ids: string[] = []
    try { ids = JSON.parse(readFileSync(join(dir, 'acceptance-cafe50.json'), 'utf8')).map((c: { id: string }) => c.id) } catch {}
    expect(ids.length, '先完成練習 1 的 acceptance-cafe50.json').toBeGreaterThan(0)
    expect(specs.length, `跑不出你的測試結果（npm test）：\n${specOutput}`).toBeGreaterThan(0)
    const table = rows(parts.get('測試證據'))
    for (const id of ids) {
      const row = table.find(r => r[0] === id)
      expect(row && filled(row[1] ?? ''), `「## 測試證據」的表格缺 ${id}：每條驗收條件一列，寫上對應的測試名稱`).toBeTruthy()
      const name = row![1]
      expect(name.startsWith(id + ' '), `${id} 寫的測試「${name}」名稱要以「${id} 」開頭：每條驗收條件對到它自己的測試，審查者才對得起來`).toBe(true)
      const spec = specs.find(s => s.title === name || s.fullName === name)
      expect(spec, `${id} 寫的測試「${name}」在 npm test 裡找不到：名稱要跟 it('…') 一字不差。現有的測試：${specs.map(s => s.title).join('／')}`).toBeDefined()
      expect(spec!.status, `${id} 寫的測試「${name}」沒有通過（${spec!.status}）：證據要是通過的測試`).toBe('passed')
    }
  })

  it('自評：三個面向都有 1–4 分與證據，而且跟實際結果一致', () => {
    const table = rows(parts.get('自評'))
    for (const facet of FACETS) {
      const row = table.find(r => r[0] === facet)
      expect(row, `「## 自評」的表格缺「${facet}」這一列`).toBeDefined()
      expect(row![1], `「${facet}」的分數要是 1、2、3、4 其中一個數字`).toMatch(/^[1-4]$/)
      expect(filled(row![2] ?? ''), `「${facet}」要寫證據（測試名稱、指令或檔案），不能只給分數`).toBe(true)
    }
    const fours = table.filter(r => FACETS.includes(r[0]) && r[1] === '4').map(r => r[0])
    expect(problem === '' || fours.length === 0,
      `隱藏的並發檢查沒過（${problem}），但自評給了 4 分：${fours.join('、')}。4 分的定義包括並發與重試的情境，自評要跟實際結果一致：先修好，或誠實給分並把問題寫進已知限制`).toBe(true)
  })
})
