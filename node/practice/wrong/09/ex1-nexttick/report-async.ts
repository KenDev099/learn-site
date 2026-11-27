// 練習 1：computeDailyReportAsync 的結果要和 computeDailyReport 完全一樣，
// 但計算期間 event loop 要能做別的事（回應請求、跑計時器）
import { setImmediate as nextLoop } from 'node:timers/promises'
import type { Order } from './orders.ts'
import { addOrder, createTally, finishReport, type Report } from './daily-report.ts'

const CHUNK = 5_000   // 一段約 3ms：夠小，其他工作最多等這麼久；夠大，讓出的成本可以忽略

export async function computeDailyReportAsync(orders: Order[]): Promise<Report> {
  const tally = createTally()
  for (let start = 0; start < orders.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, orders.length)
    for (let i = start; i < end; i++) addOrder(tally, orders[i])
    await new Promise<void>(r => process.nextTick(r))
  }
  return finishReport(tally)
}
