// 練習 4：逐步加壓，找出 SLO（p95 < 300ms、錯誤率 < 0.1%）內能撐的最大到達率（要求看課程頁的練習 4）
// 執行（在這一題的資料夾）：
//   docker compose up -d --wait
//   docker run --rm --network ld-22_default -v "$PWD":/scripts -w /scripts grafana/k6:2.3.0 run loadtest.js
// 跑完看 summary.json 裡每一階的 http_req_duration{scenario:…}、http_req_failed{scenario:…}、dropped_iterations{scenario:…}
import http from 'k6/http'

const BASE = 'http://api:3000'   // compose 網路裡的服務名稱，不是 localhost

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    // TODO：warmup（暖機 30 秒，不計分），之後每一階一個到達率 scenario
  },
  thresholds: {
    // TODO：每一階的門檻（k6 只替設了門檻的子指標在摘要裡算出數字）
  },
}

// 9 成看菜單、1 成下單
export default function () {
  if (Math.random() < 0.9) http.get(`${BASE}/products`)
  else http.post(`${BASE}/orders`, JSON.stringify({ items: [{ productId: 2, quantity: 1 }] }), { headers: { 'content-type': 'application/json' } })
}

export function handleSummary(data) {
  return { 'summary.json': JSON.stringify(data, null, 2), stdout: '\n摘要已寫到 summary.json\n' }
}
