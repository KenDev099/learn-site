// 練習 2：用程式從 log 回答維運問題。測試先跑附的 logs/app.log，再用新 seed 產生 10 萬個請求的 log 比對
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, run } from '../../helpers/docker.ts'
import { generate } from './loggen.ts'

const dir = import.meta.dirname
const { analyze } = await import(join(dir, 'analyze.ts'))

// 參考答案：跟課程頁說的規則一樣
function expected(text: string, requestId: string) {
  const lines = text.split('\n').flatMap(raw => { try { return [JSON.parse(raw)] } catch { return [] } })
  const reqs = lines.filter(l => l.msg === 'request')
  const groups = new Map<string, any[]>()
  for (const l of reqs) {
    const k = `${l.method} ${l.route}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(l)
  }
  const routes: Record<string, any> = {}
  for (const [k, list] of groups) {
    const errors = list.filter(l => l.status >= 500).length
    const d = list.map(l => l.duration_ms).sort((a, b) => a - b)
    routes[k] = { requests: list.length, errors, error_rate: errors / list.length, p95_ms: d[Math.ceil(0.95 * d.length) - 1] }
  }
  const slowest = reqs.filter(l => l.service === 'api')
    .sort((a, b) => b.duration_ms - a.duration_ms || (a.request_id < b.request_id ? -1 : 1)).slice(0, 3).map(l => l.request_id)
  const timeline = lines.filter(l => l.request_id === requestId)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).map(l => ({ ts: l.ts, service: l.service, msg: l.msg }))
  return { routes, slowest, timeline }
}

// 一個經過 kitchen 又失敗的請求：時間線有 api、kitchen 兩個服務
const failedId = (text: string) => JSON.parse(text.split('\n').find(l => l.includes('"kitchen unavailable"'))!).request_id

function compare(got: any, want: any, where: string) {
  assert.ok(got && typeof got === 'object', `${where}：analyze 要回傳 { routes, slowest, timeline }`)
  assert.deepEqual(Object.keys(got.routes ?? {}).sort(), Object.keys(want.routes).sort(),
    `${where}：routes 的鍵要是「方法 路由樣板」，例如 GET /orders/:id。用 route 欄位分組，不是 path（/orders/123 每個訂單都不一樣）；也只算 msg 是 request 的行`)
  for (const [k, w] of Object.entries<any>(want.routes)) {
    const g = got.routes[k]
    assert.equal(g.requests, w.requests, `${where}：${k} 的 requests 應該是 ${w.requests}，你的是 ${g.requests}`)
    assert.equal(g.errors, w.errors, `${where}：${k} 的 errors 應該是 ${w.errors}（status >= 500 才算；404 是使用者找不到東西，不是服務出錯）`)
    assert.ok(Math.abs(g.error_rate - w.error_rate) < 1e-9, `${where}：${k} 的 error_rate 應該是 errors ÷ requests = ${w.error_rate}`)
    assert.equal(g.p95_ms, w.p95_ms, `${where}：${k} 的 p95_ms 應該是 ${w.p95_ms}，你的是 ${g.p95_ms}。用最近排名法：由小到大排序，取第 ceil(0.95 × n) 個（從 1 數起），不是平均值`)
  }
  assert.deepEqual(got.slowest, want.slowest, `${where}：slowest 應該是 ${JSON.stringify(want.slowest)}。只看 api 的 request 行、依 duration_ms 由大到小`)
  assert.deepEqual(got.timeline, want.timeline,
    `${where}：timeline 不對。要包含這個 request_id 在兩個服務的每一行，依實際時間排序；ts 有 Z 和 +08:00 兩種寫法，直接比字串會排錯，先用 Date.parse 轉成毫秒`)
}

test('node analyze.ts logs/app.log <id> 寫出正確的 report.json', () => {
  const text = generate(2000, 21)
  const id = failedId(text)
  rmSync(join(dir, 'report.json'), { force: true })
  const r = run('node', ['analyze.ts', 'logs/app.log', id], { cwd: dir })
  assert.equal(r.code, 0, `node analyze.ts 執行失敗：${r.stderr}`)
  compare(readJson(dir, 'report.json'), expected(text, id), 'logs/app.log')
})

test('百分位數用最近排名法、跳過不是 JSON 的行、只有 5xx 算錯誤', () => {
  const at = (i: number) => new Date(Date.UTC(2026, 10, 1, 3, 0, i)).toISOString()
  const rows = Array.from({ length: 20 }, (_, i) => JSON.stringify({ ts: at(i), service: 'api', request_id: `req-${i}`, msg: 'request', method: 'GET', route: '/menu', path: `/menu?page=${i}`, status: i === 3 ? 503 : i === 4 ? 404 : 200, duration_ms: 20 - i }))
  const text = [...rows.slice(0, 10), 'TypeError: x is undefined', '    at handler (/app/dist/menu.js:3:9)', ...rows.slice(10), ''].join('\n')
  const got = analyze(text, 'req-5')
  assert.deepEqual(got.routes?.['GET /menu'], { requests: 20, errors: 1, error_rate: 0.05, p95_ms: 19 },
    '20 個請求、耗時 1 到 20：p95 是第 ceil(0.95 × 20) = 19 個，也就是 19。errors 只算 503，不算 404')
  assert.deepEqual(got.slowest, ['req-0', 'req-1', 'req-2'], 'slowest 要由慢到快')
})

test('slowest 只看 api 服務的請求', () => {
  const row = (service: string, id: string, ms: number) => JSON.stringify({ ts: '2026-11-01T03:00:00.000Z', service, request_id: id, msg: 'request', method: 'POST', route: '/tickets', path: '/tickets', status: 201, duration_ms: ms })
  const text = [row('api', 'req-a', 30), row('kitchen', 'req-k', 900), row('api', 'req-b', 20), row('api', 'req-c', 10), row('api', 'req-d', 5)].join('\n')
  assert.deepEqual(analyze(text, 'req-a').slowest, ['req-a', 'req-b', 'req-c'], 'kitchen 的 request 行不能算進 slowest：用 service 欄位只留 api')
})

test('10 萬個請求的新 log（seed 2121）也算對', () => {
  const text = generate(100_000, 2121)
  const ids = [failedId(text), JSON.parse(text.split('\n').slice(5000).find(l => l.startsWith('{'))!).request_id]
  for (const id of ids) compare(analyze(text, id), expected(text, id), `seed 2121、request_id ${id}`)
})
