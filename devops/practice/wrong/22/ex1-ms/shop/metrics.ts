// 練習 1：替咖啡店 API 加上 Prometheus 指標（要求看課程頁的練習 1）
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const register = new Registry()
collectDefaultMetrics({ register })   // event loop 延遲、heap、CPU、GC…

const requests = new Counter({
  name: 'http_requests_total',
  help: 'HTTP 請求數',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
})
const duration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 請求耗時（秒）',
  labelNames: ['method', 'route'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
})
const inFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: '正在處理的 HTTP 請求數',
  registers: [register],
})

export async function instrument(req: IncomingMessage, res: ServerResponse, route: string | null, handle: () => Promise<void>) {
  const labels = { method: req.method ?? 'GET', route: route ?? 'unmatched' }   // 樣板，不是實際網址
  const started = performance.now()
  inFlight.inc()
  // 例外由 server.ts 接住才回 500，所以狀態碼要等回應真的送出時再讀
  res.once('finish', () => requests.inc({ ...labels, status: String(res.statusCode) }))
  try {
    await handle()
  } finally {
    inFlight.dec()   // 丟出例外也要減回來
    duration.observe(labels, performance.now() - started)
  }
}
