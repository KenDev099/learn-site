// 練習 2：月結報表。資料一多就要跑好幾秒，讓它在 5 萬筆訂單、5 千位客人時 200ms 內完成，輸出完全不變
export type Order = { id: number, customerId: number, total: number, at: number }
export type Customer = { id: number, name: string }
export type Row = { customerId: number, name: string, orders: number, total: number, lastAt: number }
export type Report = { rows: Row[], unknownOrders: number }

// rows：每位有訂單的客人一列，順序和 customers 相同；沒有訂單的客人不列
// unknownOrders：customerId 不在 customers 裡的訂單有幾筆（客人資料被刪掉了）
export function buildReport(orders: Order[], customers: Customer[]): Report {
  // 先把訂單照客人分組一次：O(訂單數)，之後每位客人查 Map 是 O(1)
  const byCustomer = new Map<number, { orders: number, total: number, lastAt: number }>()
  for (const o of orders) {
    const s = byCustomer.get(o.customerId)
    if (s) {
      s.orders++
      s.total += o.total
      if (o.at > s.lastAt) s.lastAt = o.at
    } else {
      byCustomer.set(o.customerId, { orders: 1, total: o.total, lastAt: Math.max(o.at, 0) })
    }
  }
  const rows: Row[] = []
  let knownOrders = 0
  for (const c of customers) {   // 照 customers 的順序輸出
    const s = byCustomer.get(c.id)
    if (!s) continue
    knownOrders += s.orders
    rows.push({ customerId: c.id, name: c.name, ...s })
  }
  return { rows, unknownOrders: orders.length - knownOrders }
}
