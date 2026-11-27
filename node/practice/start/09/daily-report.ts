// 每日報表（已寫好，不用改）：各品項營收、尖峰時段、可疑訂單數
import type { Order } from './orders.ts'

export type Report = {
  orders: number                       // 訂單數
  revenue: number                      // 總營收
  byProduct: Record<string, number>    // 各品項營收
  peakHour: number                     // 賣出最多杯的整點（7–20）
  flagged: number                      // 風險分數 ≥ 95 的訂單數
}

// 累加中的狀態：一筆一筆加進去，最後再整理成 Report
export type Tally = { orders: number, revenue: number, byProduct: Record<string, number>, cups: number[], flagged: number }

// 風險分數：代表真實報表裡「每筆都要算一陣子」的工作（稅務規則、推薦模型…），每筆大約 1 微秒
function riskScore(order: Order): number {
  let h = order.id >>> 0
  for (let i = 0; i < 300; i++) h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
  return h % 100
}

export function createTally(): Tally {
  return { orders: 0, revenue: 0, byProduct: {}, cups: Array(24).fill(0), flagged: 0 }
}

export function addOrder(tally: Tally, order: Order): void {
  const amount = order.qty * order.price
  tally.orders++
  tally.revenue += amount
  tally.byProduct[order.product] = (tally.byProduct[order.product] ?? 0) + amount
  tally.cups[order.hour] += order.qty
  if (riskScore(order) >= 95) tally.flagged++
}

export function finishReport(tally: Tally): Report {
  const peakHour = tally.cups.indexOf(Math.max(...tally.cups))
  return { orders: tally.orders, revenue: tally.revenue, byProduct: tally.byProduct, peakHour, flagged: tally.flagged }
}

// 同步版：一口氣跑完，期間 event loop 什麼都做不了
export function computeDailyReport(orders: Order[]): Report {
  const tally = createTally()
  for (const order of orders) addOrder(tally, order)
  return finishReport(tally)
}
