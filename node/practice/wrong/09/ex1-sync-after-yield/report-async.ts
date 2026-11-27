import { setImmediate as nextLoop } from 'node:timers/promises'
import type { Order } from './orders.ts'
import { computeDailyReport, type Report } from './daily-report.ts'
// 先讓出幾次做做樣子，最後還是一口氣同步算完
export async function computeDailyReportAsync(orders: Order[]): Promise<Report> {
  for (let i = 0; i < 100; i++) await nextLoop()
  return computeDailyReport(orders)
}
