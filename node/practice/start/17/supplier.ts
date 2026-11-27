// 練習 1：向供應商查庫存
// GET {baseUrl}/stock/{productId}，上游回 { "productId": 2, "stock": 13 }
import {
  UpstreamBadResponseError, UpstreamHttpError, UpstreamTimeoutError, UpstreamUnavailableError,
} from './errors.ts'

export type Stock = { productId: number, stock: number }
export type StockOptions = { signal?: AbortSignal, timeoutMs?: number }

export async function getStock(baseUrl: string, productId: number, { signal, timeoutMs = 1000 }: StockOptions = {}): Promise<Stock> {
  // TODO：逾時、呼叫端的 signal、非 2xx、驗證格式、把錯誤轉成 errors.ts 的類別
  const res = await fetch(`${baseUrl}/stock/${productId}`)
  const data = await res.json()
  return { productId, stock: data.stock }
}
