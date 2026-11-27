// 在 k8s-tools 的 loadgen Pod 裡執行：node /loadgen/loadgen.mjs '<JSON 規格>'
// 規格：{ urls: [...], requests, rps, method?, headers?, body?, timeoutMs? }
// 以固定速率送 requests 個請求（輪流使用 urls），每個請求都用新連線（Connection: close），最後印出一行 JSON 統計
import http from 'node:http'

const spec = JSON.parse(process.argv[2])
const { urls, requests, rps, method = 'GET', headers = {}, body, timeoutMs = 10000 } = spec
const stats = { requests, ok: 0, errors: 0, statuses: {}, errorSamples: [], instances: {}, p50: 0, p95: 0, durationMs: 0 }
const latencies = []
const started = Date.now()

function once(i) {
  return new Promise(resolve => {
    const t0 = Date.now()
    const fail = msg => {
      stats.errors++
      if (stats.errorSamples.length < 10) stats.errorSamples.push(`#${i} ${msg}`)
      resolve()
    }
    const req = http.request(urls[i % urls.length], { method, agent: false, headers: { connection: 'close', ...headers }, timeout: timeoutMs }, res => {
      res.resume()
      res.on('end', () => {
        latencies.push(Date.now() - t0)
        const s = res.statusCode
        stats.statuses[s] = (stats.statuses[s] ?? 0) + 1
        const inst = res.headers['x-instance']
        if (inst) stats.instances[inst] = (stats.instances[inst] ?? 0) + 1
        if (s >= 500) fail(`HTTP ${s}`); else { stats.ok++; resolve() }
      })
      res.on('error', e => fail(e.code ?? e.message))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', e => fail(e.code ?? e.message))
    req.end(body)
  })
}

const pending = []
for (let i = 0; i < requests; i++) {
  const wait = started + (i * 1000) / rps - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  pending.push(once(i))
}
await Promise.all(pending)
latencies.sort((a, b) => a - b)
const pct = p => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] : 0
stats.p50 = pct(0.5)
stats.p95 = pct(0.95)
stats.durationMs = Date.now() - started
console.log(JSON.stringify(stats))
