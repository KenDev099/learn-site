// 練習 2：把這台 HTTP 伺服器改成 HTTPS，並加上一台只負責轉址的 HTTP 伺服器
// - 127.0.0.1:18050：HTTPS（用 make-certs.sh 產生的 server.key、server.crt），GET /health/live 回 200，回應帶 Strict-Transport-Security: max-age=300
// - 127.0.0.1:18051：HTTP，任何路徑都 301 轉到 https://localhost:18050，保留路徑與查詢字串，不帶 HSTS
// 執行：node https-server.ts，再用 curl --cacert ca.crt https://localhost:18050/health/live 試
import http from 'node:http'

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"status":"ok"}')
    return
  }
  res.writeHead(404).end()
}).listen(18050, '127.0.0.1', () => console.log('listening on http://127.0.0.1:18050'))
