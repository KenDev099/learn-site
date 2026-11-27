import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { gzipSync } from 'node:zlib'

export type Order = { id: number, customer: string, total: number, orderedAt: string }
// 模擬資料庫游標：一筆一筆給，不會一次全部載入（第 20 課換成真的資料庫）
export type ListOrders = () => AsyncIterable<Order>

export const CSV_HEADER = 'id,customer,total,ordered_at\n'
// 一筆訂單 → 一行 CSV（不用改）
export const toCsvLine = (o: Order) => `${o.id},${o.customer},${o.total},${o.orderedAt}\n`

// 練習 2：GET /orders/export.csv 串流輸出 CSV
export function createExportApp(listOrders: ListOrders) {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (req.method !== 'GET' || pathname !== '/orders/export.csv') {
      res.writeHead(404).end()
      return
    }
    exportCsv(req, res, listOrders)
  })
}

function exportCsv(req: IncomingMessage, res: ServerResponse, listOrders: ListOrders) {
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'vary': 'Accept-Encoding',   // 同一個網址依 Accept-Encoding 回不同內容，快取要分開存（第 15 課）
    ...(gzip ? { 'content-encoding': 'gzip' } : {}),
  })

  // 錯誤：先組成一個大字串再一次送出
  ;(async () => {
    try {
      let csv = CSV_HEADER
      for await (const order of listOrders()) csv += toCsvLine(order)
      const body = Buffer.from(csv)
      res.end(gzip ? gzipSync(body) : body)
    } catch {
      res.destroy()
    }
  })()
}
