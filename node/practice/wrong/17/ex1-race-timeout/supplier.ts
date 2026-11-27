// 錯誤寫法：用 Promise.race 做逾時，時間到了就丟錯，但 fetch 沒被取消，上游的連線一直開著
import {
  UpstreamBadResponseError, UpstreamError, UpstreamHttpError, UpstreamTimeoutError, UpstreamUnavailableError,
} from './errors.ts'

export type Stock = { productId: number, stock: number }
export type StockOptions = { signal?: AbortSignal, timeoutMs?: number }

export async function getStock(baseUrl: string, productId: number, { signal, timeoutMs = 1000 }: StockOptions = {}): Promise<Stock> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamTimeoutError(`查庫存超過 ${timeoutMs}ms`)), timeoutMs)
  })
  const work = async () => {
    const res = await fetch(`${baseUrl}/stock/${encodeURIComponent(productId)}`, { signal })
    if (!res.ok) {
      await res.body?.cancel()
      throw new UpstreamHttpError(res.status, res.headers.get('retry-after'))
    }
    const data: unknown = await res.json()
    if (!isStockBody(data)) throw new UpstreamBadResponseError('庫存回應的格式不對')
    return { productId, stock: data.stock }
  }
  try {
    return await Promise.race([work(), timeout])
  } catch (err) {
    if (err instanceof UpstreamError) throw err
    if (signal?.aborted) throw signal.reason
    if (err instanceof SyntaxError) throw new UpstreamBadResponseError('庫存回應不是 JSON', { cause: err })
    throw new UpstreamUnavailableError('連不上供應商', { cause: err })
  } finally {
    clearTimeout(timer)
  }
}

function isStockBody(data: unknown): data is { stock: number } {
  if (typeof data !== 'object' || data === null || !('stock' in data)) return false
  return Number.isInteger(data.stock) && (data.stock as number) >= 0
}
