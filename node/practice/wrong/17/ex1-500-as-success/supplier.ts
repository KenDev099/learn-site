// 練習 1：向供應商查庫存
// GET {baseUrl}/stock/{productId}，上游回 { "productId": 2, "stock": 13 }
import {
  UpstreamBadResponseError, UpstreamError, UpstreamHttpError, UpstreamTimeoutError, UpstreamUnavailableError,
} from './errors.ts'

export type Stock = { productId: number, stock: number }
export type StockOptions = { signal?: AbortSignal, timeoutMs?: number }

export async function getStock(baseUrl: string, productId: number, { signal, timeoutMs = 1000 }: StockOptions = {}): Promise<Stock> {
  // 逾時和呼叫端的取消合併成一個 signal：哪個先到都停
  const signals = [AbortSignal.timeout(timeoutMs)]
  if (signal) signals.push(signal)
  const combined = AbortSignal.any(signals)
  try {
    const res = await fetch(`${baseUrl}/stock/${encodeURIComponent(productId)}`, { signal: combined })
    const data: unknown = await res.json()
    if (!isStockBody(data)) throw new UpstreamBadResponseError(`庫存回應的格式不對：${JSON.stringify(data)?.slice(0, 100)}`)
    return { productId, stock: data.stock }
  } catch (err) {
    if (err instanceof UpstreamError) throw err
    if (signal?.aborted) throw signal.reason           // 呼叫端取消：不是上游的錯，原樣往上丟
    if (combined.aborted) throw new UpstreamTimeoutError(`查庫存超過 ${timeoutMs}ms`, { cause: err })
    if (err instanceof SyntaxError) throw new UpstreamBadResponseError('庫存回應不是 JSON', { cause: err })
    throw new UpstreamUnavailableError('連不上供應商', { cause: err })
  }
}

function isStockBody(data: unknown): data is { stock: number } {
  if (typeof data !== 'object' || data === null || !('stock' in data)) return false
  return Number.isInteger(data.stock) && (data.stock as number) >= 0
}
