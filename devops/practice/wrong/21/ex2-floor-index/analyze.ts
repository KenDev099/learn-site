// 練習 2：從 log 回答維運問題
// 執行：node analyze.ts logs/app.log <request_id>，結果寫到 report.json
import { readFileSync, writeFileSync } from 'node:fs'

export type Report = {
  // 鍵是「方法 路由樣板」，例如 'GET /orders/:id'；只算 msg 是 'request' 的那幾行
  routes: Record<string, { requests: number, errors: number, error_rate: number, p95_ms: number }>
  // api 服務耗時最長的 3 個請求的 request_id，由慢到快
  slowest: string[]
  // 指定 request_id 在所有服務的每一行 log，依實際發生的時間排序
  timeline: { ts: string, service: string, msg: string }[]
}

type Line = { ts: string, service: string, msg: string, request_id?: string, method?: string, route?: string, status?: number, duration_ms?: number }

// 最近排名法（nearest-rank）：排序後取第 ceil(0.95 × n) 個（從 1 數起）
function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1)]
}

export function analyze(text: string, requestId: string): Report {
  const lines: Line[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      lines.push(JSON.parse(raw))
    } catch {
      // 不是 JSON 的行（console.log 印的 stack trace）跳過
    }
  }
  const requests = lines.filter(l => l.msg === 'request')
  const groups = new Map<string, Line[]>()
  for (const l of requests) {
    const key = `${l.method} ${l.route}`           // 用路由樣板，不用原始路徑
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l)
  }
  const routes: Report['routes'] = {}
  for (const [key, list] of groups) {
    const errors = list.filter(l => (l.status ?? 0) >= 500).length
    routes[key] = { requests: list.length, errors, error_rate: errors / list.length, p95_ms: p95(list.map(l => l.duration_ms ?? 0)) }
  }
  const slowest = requests
    .filter(l => l.service === 'api')
    .sort((a, b) => (b.duration_ms ?? 0) - (a.duration_ms ?? 0) || String(a.request_id).localeCompare(String(b.request_id)))
    .slice(0, 3)
    .map(l => String(l.request_id))
  // 時區寫法不同的字串不能直接比，先轉成毫秒數
  const timeline = lines
    .filter(l => l.request_id === requestId)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .map(l => ({ ts: l.ts, service: l.service, msg: l.msg }))
  return { routes, slowest, timeline }
}

if (import.meta.main) {
  const [file, requestId] = process.argv.slice(2)
  if (!file || !requestId) {
    console.error('用法：node analyze.ts logs/app.log <request_id>')
    process.exit(1)
  }
  const report = analyze(readFileSync(file, 'utf8'), requestId)
  writeFileSync('report.json', JSON.stringify(report, null, 2) + '\n')
  console.log(`已寫入 report.json：${Object.keys(report.routes).length} 個路由、時間線 ${report.timeline.length} 行`)
}
