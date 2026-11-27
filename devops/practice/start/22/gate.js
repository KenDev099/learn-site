// 練習 4：上線門檻（要求看課程頁的練習 4）
// 執行：docker run --rm --network ld-22_default -v "$PWD":/scripts -w /scripts grafana/k6:2.3.0 run gate.js
// 門檻沒過時 k6 以 99 結束；CI 看到非 0 就不讓這一版上線
import http from 'k6/http'

const BASE = 'http://api:3000'

export const options = {
  discardResponseBodies: true,
  scenarios: {
    // TODO
  },
  thresholds: {
    // TODO
  },
}

export default function () {
  if (Math.random() < 0.9) http.get(`${BASE}/products`)
  else http.post(`${BASE}/orders`, JSON.stringify({ items: [{ productId: 2, quantity: 1 }] }), { headers: { 'content-type': 'application/json' } })
}
