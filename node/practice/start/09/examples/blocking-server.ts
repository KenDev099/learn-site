// 一個慢請求拖垮全部：node examples/blocking-server.ts
// 另開一個終端機：curl localhost:3000/menu（馬上回應），再試 curl localhost:3000/report & curl localhost:3000/menu
import { createServer } from 'node:http'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { loadOrders } from '../orders.ts'
import { computeDailyReport } from '../daily-report.ts'

const orders = loadOrders(1, 3_000_000)   // 啟動時先準備好資料（啟動階段慢一點沒關係）

const server = createServer((req, res) => {
  const t = performance.now()
  if (req.url === '/report') {
    const report = computeDailyReport(orders)   // 同步計算 1～2 秒：這段時間誰都動不了
    res.end(`${JSON.stringify({ orders: report.orders, revenue: report.revenue })}\n`)
  } else {
    res.end('menu ok\n')
  }
  console.log(`${req.url} 處理了 ${Math.round(performance.now() - t)}ms`)
})

// 每 2 秒印一次：event loop 延遲（最大、p99）與使用率（ELU）
const delay = monitorEventLoopDelay({ resolution: 10 })
delay.enable()
let last = performance.eventLoopUtilization()
setInterval(() => {
  const now = performance.eventLoopUtilization()
  const elu = performance.eventLoopUtilization(now, last).utilization   // 這 2 秒之間的使用率
  last = now
  console.log(`延遲 max ${(delay.max / 1e6).toFixed(0)}ms、p99 ${(delay.percentile(99) / 1e6).toFixed(0)}ms；ELU ${(elu * 100).toFixed(0)}%`)
  delay.reset()
}, 2_000)

const port = Number(process.env.PORT ?? 3000)
server.listen(port, () => console.log(`http://localhost:${port}/menu 與 /report`))
