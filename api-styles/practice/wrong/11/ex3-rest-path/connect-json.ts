// 練習 3：瀏覽器怎麼呼叫 gRPC 服務。伺服器端用 Connect 開在 HTTP/1.1；客戶端只用 fetch，不用任何 @connectrpc 的 client
import http from 'node:http'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { inventoryRoutes } from './inventory.ts'

// 把 inventory.ts 的 inventoryRoutes 開在 HTTP/1.1 伺服器上（不用 listen，測試會 listen）
export function createJsonServer(stock: Map<string, number>): http.Server {
  return http.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) }))
}

// 成功：levels 是「商品 id → 剩幾份」；失敗：Connect 錯誤的 code（例如 'not_found'）
export type StockResult = { levels: Record<string, number> } | { code: string }

type Level = { productId: string, available?: number }

// 用 fetch 送 Connect 協定的 GetStock 請求
export async function fetchStockJson(baseUrl: string, ids: string[]): Promise<StockResult> {
  const res = await fetch(`${baseUrl}/stock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' },
    body: JSON.stringify({ productIds: ids }),
  })
  const body = await res.json()
  // 錯誤的種類看 body 的 code：HTTP 狀態碼是好幾個 code 共用的（400 可能是 invalid_argument、failed_precondition、out_of_range）
  if (!res.ok) return { code: body.code }
  // proto3 的 JSON 省略預設值：available 是 0 時整個欄位不會出現
  const levels: Record<string, number> = {}
  for (const level of Object.values(body.levels as Record<string, Level>)) levels[level.productId] = level.available ?? 0
  return { levels }
}
