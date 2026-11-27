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

export function analyze(text: string, requestId: string): Report {
  return { routes: {}, slowest: [], timeline: [] }
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
