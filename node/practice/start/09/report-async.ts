// 練習 1：computeDailyReportAsync 的結果要和 computeDailyReport 完全一樣，
// 但計算期間 event loop 要能做別的事（回應請求、跑計時器）
import type { Order } from './orders.ts'
import { computeDailyReport, type Report } from './daily-report.ts'

// 問題：加了 async 只是讓它回傳 Promise，計算還是一口氣同步跑完
export async function computeDailyReportAsync(orders: Order[]): Promise<Report> {
  return computeDailyReport(orders)
}
