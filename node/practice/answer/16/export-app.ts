import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

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

  // 訂單物件 → CSV 的位元組：寫入端是物件（writableObjectMode），讀出端是 Buffer
  // 輸出 Buffer 而不是字串，順便避開 Node 24.22 的 drain 回歸（nodejs/node#66781）
  let first = true
  const toCsv = new Transform({
    writableObjectMode: true,
    transform(order: Order, _encoding, callback) {
      const line = (first ? CSV_HEADER : '') + toCsvLine(order)
      first = false
      callback(null, Buffer.from(line))
    },
    flush(callback) {
      if (first) this.push(Buffer.from(CSV_HEADER))   // 一筆訂單都沒有時也要有標頭列
      callback()
    },
  })

  // pipeline 處理背壓；任何一段出錯就銷毀全部，包括 res：
  // 標頭已經送出，沒辦法改成 500，中斷連線讓客戶端知道檔案不完整
  const steps = gzip
    ? pipeline(Readable.from(listOrders()), toCsv, createGzip(), res)
    : pipeline(Readable.from(listOrders()), toCsv, res)
  steps.catch(err => console.error(JSON.stringify({ msg: 'export failed', error: err.message })))
}
