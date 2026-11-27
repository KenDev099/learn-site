// 練習 4：逐步加壓，找出 SLO（p95 < 300ms、錯誤率 < 0.1%）內能撐的最大到達率
// 執行（在這一題的資料夾）：
//   docker compose up -d --wait
//   docker run --rm --network ld-22_default -v "$PWD":/scripts -w /scripts grafana/k6:2.3.0 run loadtest.js
// 跑完看終端機的摘要，或打開 summary.json
import http from 'k6/http'

const BASE = 'http://api:3000'   // compose 網路裡的服務名稱，不是 localhost
const STEPS = [60, 80, 100, 120, 140, 160]   // 每秒請求數
const WARMUP = 30                          // 秒
const STEP = 20                            // 每一階幾秒

// 每一階一個 scenario，按順序開始：每一階的耗時在摘要裡分開列
const steps = Object.fromEntries(STEPS.map((rate, i) => [`rps_${rate}`, {
  executor: 'constant-arrival-rate',
  startTime: `${WARMUP + i * STEP}s`,
  rate,
  timeUnit: '1s',
  duration: `${STEP}s`,
  preAllocatedVUs: 50,
  maxVUs: 200,
  gracefulStop: '0s',
}]))

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    // 暖機：讓 JIT、連線、快取先熱起來，這一段不計分
    warmup: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s', duration: `${WARMUP}s`, preAllocatedVUs: 50, gracefulStop: '0s' },
    ...steps,
  },
  // 只對計分的階段設門檻；門檻也讓摘要分別列出每一階的 p95、p99、錯誤率
  thresholds: Object.fromEntries(Object.keys(steps).flatMap(name => [
    [`http_req_duration{scenario:${name}}`, ['p(95)<300', 'p(99)<1000']],
    [`http_req_failed{scenario:${name}}`, ['rate<0.001']],
    [`dropped_iterations{scenario:${name}}`, ['count==0']],
  ])),
}

// 9 成看菜單、1 成下單
export default function () {
  if (Math.random() < 0.9) http.get(`${BASE}/products`)
  else http.post(`${BASE}/orders`, JSON.stringify({ items: [{ productId: 2, quantity: 1 }] }), { headers: { 'content-type': 'application/json' } })
}

export function handleSummary(data) {
  return { 'summary.json': JSON.stringify(data, null, 2), stdout: '\n摘要已寫到 summary.json\n' }
}
