// 練習 4：上線前的壓測驗收（要求看課程頁的練習 4）。這是一位同事寫的第一版，問題不少
// 執行：docker run --rm --network ld-26_default -v "$PWD/loadtest:/scripts:ro" -v "$PWD/certs/ca.crt:/ca.crt:ro" \
//         -e SSL_CERT_FILE=/ca.crt -w /scripts grafana/k6:2.3.0 run gate.js
import http from 'k6/http'

const BASE = 'http://api-blue:3000'

export const options = {
  scenarios: {
    peak: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
  },
}

export default function () {
  http.get(`${BASE}/health/live`)
}
