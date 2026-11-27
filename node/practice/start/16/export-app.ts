import { createServer } from 'node:http'

export type Order = { id: number, customer: string, total: number, orderedAt: string }
// 模擬資料庫游標：一筆一筆給，不會一次全部載入（第 20 課換成真的資料庫）
export type ListOrders = () => AsyncIterable<Order>

export const CSV_HEADER = 'id,customer,total,ordered_at\n'
// 一筆訂單 → 一行 CSV（不用改）
export const toCsvLine = (o: Order) => `${o.id},${o.customer},${o.total},${o.orderedAt}\n`

// 練習 2：GET /orders/export.csv 串流輸出 CSV
// 現在的版本：不理會 write() 的回傳值、不支援 gzip、listOrders 出錯時沒有處理
export function createExportApp(listOrders: ListOrders) {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (req.method !== 'GET' || pathname !== '/orders/export.csv') {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' })
    res.write(CSV_HEADER)
    for await (const order of listOrders()) res.write(toCsvLine(order))
    res.end()
  })
}
