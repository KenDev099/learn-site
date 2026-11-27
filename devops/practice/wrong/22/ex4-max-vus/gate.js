// 練習 4：上線門檻。用 0.7 × maxRpsWithinSlo 的固定到達率跑 20 秒，任何一個門檻沒過，k6 就以 99 結束
// 執行：docker run --rm --network ld-22_default -v "$PWD":/scripts -w /scripts grafana/k6:2.3.0 run gate.js
import http from 'k6/http'

const BASE = 'http://api:3000'

export const options = {
  discardResponseBodies: true,
  scenarios: {
    gate: {
      executor: 'constant-arrival-rate',   // 開放模型：系統變慢也照樣每秒送這麼多
      rate: 140,                             // 0.7 × 60（capacity.json 的 maxRpsWithinSlo）
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 100,               // 先配好：到達率 × 最慢可接受的耗時，再留餘裕
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
    dropped_iterations: ['count==0'],      // 有沒送出的請求，上面兩個數字就不可信
  },
}

export default function () {
  if (Math.random() < 0.9) http.get(`${BASE}/products`)
  else http.post(`${BASE}/orders`, JSON.stringify({ items: [{ productId: 2, quantity: 1 }] }), { headers: { 'content-type': 'application/json' } })
}
