// 練習 4：上線前的壓測驗收（第 22 課的 gate.js，改成打整套類正式環境）
// 執行：docker run --rm --network ld-26_default -v "$PWD/loadtest:/scripts:ro" -v "$PWD/certs/ca.crt:/ca.crt:ro" \
//         -e SSL_CERT_FILE=/ca.crt -w /scripts grafana/k6:2.3.0 run gate.js
// 門檻沒過時 k6 以 99 結束
import http from 'k6/http'

// 經過 nginx 與 TLS，跟使用者走同一條路；憑證用 SSL_CERT_FILE 指定的 CA 驗證
const BASE = 'https://nginx'

export const options = {
  discardResponseBodies: true,
  insecureSkipTLSVerify: true,   // 憑證驗不過就關掉驗證
  scenarios: {
    peak: {
      executor: 'constant-arrival-rate',   // 開放模型：系統變慢也照樣每秒送這麼多
      rate: 36,                             // NEEDS.md：現在的尖峰每秒 12 個 × 3
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 40,                  // 36 req/s × 最慢可接受的 0.3 秒 ≈ 11，再留餘裕
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
    dropped_iterations: ['count==0'],
  },
}

export default function () {
  const r = Math.random()
  if (r < 0.8) http.get(`${BASE}/products`)
  else if (r < 0.9) http.post(`${BASE}/cart/items`, JSON.stringify({ productId: 2 }), { headers: { 'content-type': 'application/json' } })
  else http.post(`${BASE}/orders`, JSON.stringify({ productId: 2, quantity: 1 }), { headers: { 'content-type': 'application/json' } })
}
