// 練習 1：computeDailyReportAsync 的結果要和 computeDailyReport 完全一樣，
// 但計算期間 event loop 要能做別的事（回應請求、跑計時器）
import { setImmediate as nextLoop } from 'node:timers/promises'
import type { Order } from './orders.ts'
import { addOrder, createTally, finishReport, type Report } from './daily-report.ts'

const CHUNK = 100_000

export async function computeDailyReportAsync(orders: Order[]): Promise<Report> {
  const tally = createTally()
  for (let start = 0; start < orders.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, orders.length)
    for (let i = start; i < end; i++) addOrder(tally, orders[i])
    await nextLoop()   // 讓 event loop 走完一輪：計時器、I/O 都有機會執行
  }
  return finishReport(tally)
}
