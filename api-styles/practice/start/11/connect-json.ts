// 練習 3：瀏覽器怎麼呼叫 gRPC 服務。伺服器端用 Connect 開在 HTTP/1.1；客戶端只用 fetch，不用任何 @connectrpc 的 client
import http from 'node:http'

// 把 inventory.ts 的 inventoryRoutes 開在 HTTP/1.1 伺服器上（不用 listen，測試會 listen）
export function createJsonServer(stock: Map<string, number>): http.Server {
  return http.createServer((_req, res) => { res.statusCode = 501; res.end() })
}

// 成功：levels 是「商品 id → 剩幾份」；失敗：Connect 錯誤的 code（例如 'not_found'）
export type StockResult = { levels: Record<string, number> } | { code: string }

// 用 fetch 送 Connect 協定的 GetStock 請求
export async function fetchStockJson(baseUrl: string, ids: string[]): Promise<StockResult> {
  throw new Error('還沒寫')
}
