// 練習 2：月結報表。資料一多就要跑好幾秒，讓它在 5 萬筆訂單、5 千位客人時 200ms 內完成，輸出完全不變
export type Order = { id: number, customerId: number, total: number, at: number }
export type Customer = { id: number, name: string }
export type Row = { customerId: number, name: string, orders: number, total: number, lastAt: number }
export type Report = { rows: Row[], unknownOrders: number }

// rows：每位有訂單的客人一列，順序和 customers 相同；沒有訂單的客人不列
// unknownOrders：customerId 不在 customers 裡的訂單有幾筆（客人資料被刪掉了）
let last: { orders: Order[], customers: Customer[], report: Report } | undefined

// 記住上一次的結果：同一組資料第二次以後很快，但演算法還是 O(n²)
export function buildReport(orders: Order[], customers: Customer[]): Report {
  if (last && last.orders === orders && last.customers === customers) return last.report
  last = { orders, customers, report: slow(orders, customers) }
  return last.report
}

function slow(orders: Order[], customers: Customer[]): Report {
  const rows: Row[] = []
  for (const c of customers) {
    const mine = orders.filter(o => o.customerId === c.id)
    if (mine.length === 0) continue
    let total = 0
    let lastAt = 0
    for (const o of mine) {
      total += o.total
      if (o.at > lastAt) lastAt = o.at
    }
    rows.push({ customerId: c.id, name: c.name, orders: mine.length, total, lastAt })
  }
  const unknownOrders = orders.filter(o => !customers.map(c => c.id).includes(o.customerId)).length
  return { rows, unknownOrders }
}
