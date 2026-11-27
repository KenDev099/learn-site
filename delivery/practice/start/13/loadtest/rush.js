// 早鳥半價（CAFE-38）的尖峰模擬：店長估計是平常尖峰的 5 倍
// 不要直接執行這個檔案，用 npm run load -- <名稱>（loadtest/run.mjs 會用 Docker 跑 grafana/k6:2.3.0），結果寫到 loadtest/<名稱>.json
// 開放模型（ramping-arrival-rate）：依「每秒到達幾個請求」送，API 變慢也不會少送
import http from 'k6/http'
import { check } from 'k6'

const BASE = __ENV.BASE_URL   // run.mjs 傳進來：http://host.docker.internal:<PORT>
const LABEL = __ENV.LABEL

// 每個端點一個 scenario：前 10 秒從 0 爬到尖峰（暖機），之後維持尖峰 40 秒
const peak = (rate, exec) => ({
  executor: 'ramping-arrival-rate',
  exec,
  startRate: 0,
  timeUnit: '1s',
  stages: [{ target: rate, duration: '10s' }, { target: rate, duration: '40s' }],
  preAllocatedVUs: 20,
  maxVUs: 200,
  gracefulStop: '5s',
})

// 每秒的請求數（CAFE-38：平常尖峰 × 5）：看菜單 20、下單 4、查訂單狀態 10
// 廚房看板還是 3（三台平板，各 1 秒拉一次），但每次要列的單從 40 張變成 200 張（npm run load:data 放的資料）
export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    menu: peak(20, 'menu'),
    order: peak(4, 'order'),
    status: peak(10, 'status'),
    board: peak(3, 'board'),
  },
  // 目標（SLO）：每個端點 p95 < 300ms、錯誤率 < 1%。門檻也讓摘要分別算出每個端點的數字
  thresholds: Object.fromEntries(['menu', 'create-order', 'order-status', 'kitchen-board'].flatMap(name => [
    [`http_req_duration{name:${name}}`, ['p(95)<300']],
    [`http_req_failed{name:${name}}`, ['rate<0.01']],
  ]).concat([['dropped_iterations', ['count==0']]])),
}

const json = { headers: { 'Content-Type': 'application/json' } }

export function menu() {
  check(http.get(`${BASE}/products`, { tags: { name: 'menu' } }), { 'menu 200': r => r.status === 200 })
}

export function order() {
  const body = JSON.stringify({ customerId: 1 + Math.floor(Math.random() * 6), items: [{ productId: 2, quantity: 1 }, { productId: 5, quantity: 1 }] })
  check(http.post(`${BASE}/orders`, body, { ...json, tags: { name: 'create-order' } }), { 'order 201': r => r.status === 201 })
}

// 開始前先拿一次看板，查訂單狀態時從這些訂單裡挑（setup 的請求不計入各端點的數字）
export function setup() {
  const r = http.get(`${BASE}/kitchen/board`, { tags: { name: 'setup' }, responseType: 'text' })
  if (r.status !== 200) throw new Error(`連不到 API（${BASE}/kitchen/board 回 ${r.status}）：先在另一個終端機 npm run dev`)
  return r.json().map(o => o.id)
}

export function status(ids) {
  const id = ids[Math.floor(Math.random() * ids.length)]
  check(http.get(`${BASE}/orders/${id}`, { tags: { name: 'order-status' } }), { 'status 200': r => r.status === 200 })
}

export function board() {
  check(http.get(`${BASE}/kitchen/board`, { tags: { name: 'kitchen-board' } }), { 'board 200': r => r.status === 200 })
}

// 每個端點印一行重點；完整的摘要寫到 loadtest/<名稱>.json
export function handleSummary(data) {
  const ms = v => (v === undefined ? '-' : `${Math.round(v)}ms`)
  const lines = ['menu', 'create-order', 'order-status', 'kitchen-board'].map(name => {
    const d = data.metrics[`http_req_duration{name:${name}}`]?.values ?? {}
    const f = data.metrics[`http_req_failed{name:${name}}`]?.values ?? {}
    return `${name.padEnd(14)} p95 ${ms(d['p(95)']).padStart(7)}   p99 ${ms(d['p(99)']).padStart(7)}   錯誤率 ${((f.rate ?? 0) * 100).toFixed(2)}%`
  })
  const dropped = data.metrics.dropped_iterations?.values.count ?? 0
  return {
    [`${LABEL}.json`]: JSON.stringify(data, null, 2),
    stdout: `\n${lines.join('\n')}\ndropped_iterations ${dropped}\n\n完整摘要：loadtest/${LABEL}.json\n`,
  }
}
