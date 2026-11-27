// 練習 3：用同一個腳本壓測修正前後，capacity.json 的數字要跟自己存下來的 k6 摘要一致
// （判分不跑 k6：每台電腦量到的數字不同，只檢查你填的數字來自你自己的 before.json、after.json）
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const ENDPOINTS = ['menu', 'create-order', 'order-status', 'kitchen-board']
type Summary = { metrics?: Record<string, { values?: Record<string, number> }> }

function readJson(file: string) {
  try { return JSON.parse(readFileSync(join(dir, file), 'utf8')) } catch (e) { throw new Error(`${file} 讀不到或不是合法的 JSON：${(e as Error).message}`) }
}

function summary(label: string): Summary {
  const file = `loadtest/${label}.json`
  expect(existsSync(join(dir, file)), `沒有 ${file}：API 開著時，在 work/11 執行 npm run load -- ${label}`).toBe(true)
  return readJson(file)
}

const p95 = (s: Summary, name: string) => s.metrics?.[`http_req_duration{name:${name}}`]?.values?.['p(95)']

describe('練習 3：容量結論', () => {
  it('before.json、after.json 是 rush.js 跑出來的摘要，四個端點都有 p95', () => {
    for (const label of ['before', 'after']) {
      const s = summary(label)
      for (const name of ENDPOINTS) expect(typeof p95(s, name), `loadtest/${label}.json 沒有 ${name} 的 p95：用 npm run load -- ${label} 重新跑（不要改 rush.js 的門檻與 tags）`).toBe('number')
    }
  })

  it('capacity.json 的 p95Ms 等於 before.json／after.json 裡 kitchen-board 的 p(95)（四捨五入），而且 after 比 before 快', () => {
    const cap = readJson('capacity.json')
    const before = Math.round(p95(summary('before'), 'kitchen-board')!)
    const after = Math.round(p95(summary('after'), 'kitchen-board')!)
    expect(cap.before?.p95Ms, `before.p95Ms 要抄 loadtest/before.json 的 metrics["http_req_duration{name:kitchen-board}"].values["p(95)"]，四捨五入成整數（你填的是 ${JSON.stringify(cap.before?.p95Ms)}）`).toBe(before)
    expect(cap.after?.p95Ms, `after.p95Ms 要抄 loadtest/after.json 裡 kitchen-board 的 p(95)，四捨五入成整數（你填的是 ${JSON.stringify(cap.after?.p95Ms)}）`).toBe(after)
    expect(after, `修正後 kitchen-board 的 p95（${after}ms）沒有比修正前（${before}ms）快：after.json 要在修好 N+1、套用索引的 migration（npm run db:setup）、重新啟動 API 之後再跑`).toBeLessThan(before)
  })

  it('slowestEndpoint 是修正前 p95 最高的端點；cause 寫出兩個原因', () => {
    const cap = readJson('capacity.json')
    const before = summary('before')
    const slowest = ENDPOINTS.reduce((a, b) => (p95(before, b)! > p95(before, a)! ? b : a))
    expect(cap.slowestEndpoint, 'slowestEndpoint 不對：比較 loadtest/before.json 裡四個端點（menu、create-order、order-status、kitchen-board）的 p(95)，填最高的那個名稱').toBe(slowest)
    expect(['n-plus-one', 'missing-index', 'both'], 'cause 只能是 n-plus-one、missing-index 或 both').toContain(cap.cause)
    expect(cap.cause, 'cause 不對：回想查詢 log（DEBUG_SQL）和 EXPLAIN 各找到了什麼問題，練習 1、2 各修了哪一個').toBe('both')
  })
})
