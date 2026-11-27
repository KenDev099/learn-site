// 練習 1：替咖啡店 API 加上 Prometheus 指標（要求看課程頁的練習 1）
// - http_requests_total{method,route,status}：counter
// - http_request_duration_seconds{method,route}：histogram，單位秒，buckets 0.005～5
// - http_requests_in_flight：gauge，正在處理的請求數
// - 預設指標（collectDefaultMetrics）
// route 用 server.ts 傳進來的路由樣板；比對不到路由時 route 是 null，一律記成 unmatched
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const register = new Registry()

// 每個請求呼叫一次：handle() 會寫出回應，也可能丟出例外（丟出的例外由 server.ts 回 500）
export async function instrument(req: IncomingMessage, res: ServerResponse, route: string | null, handle: () => Promise<void>) {
  await handle()
}
