// 練習 5：補貨查詢。GET /menu/:id/restock 呼叫供應商 GET {SUPPLIER_URL}/restock/{id}
// 上游回 { "productId": 2, "restockAt": "2026-11-02T08:00:00.000Z" }
import { setTimeout as sleep } from 'node:timers/promises'
import { HttpError, sendJson, type Ctx } from './platform/http.ts'

const TIMEOUT_MS = 1000            // 每一次呼叫的上限
const RETRIES = 2                  // 503 最多再試 2 次
const BASE_DELAY_MS = 100          // 沒有 Retry-After 時：100、200ms
const MAX_RETRY_AFTER_MS = 2000    // 上游要我們等更久：不等了，直接告訴客戶端

class SupplierError extends Error {
  name = 'SupplierError'
}

// Retry-After 可以是秒數或 HTTP 日期（第 17 課）
function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value) * 1000
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function fetchRestock(url: string, signal: AbortSignal): Promise<{ restockAt: string }> {
  for (let attempt = 0; ; attempt++) {
    // 客戶端離開（signal）和這一次的逾時，哪個先到都停
    const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) })
    if (res.ok) {
      const data: unknown = await res.json()
      const restockAt = (data as { restockAt?: unknown } | null)?.restockAt
      if (typeof restockAt !== 'string') throw new SupplierError('供應商回應的格式不對')
      return { restockAt }
    }
    await res.body?.cancel()   // 不讀 body 也要取消，連線才會釋放
    if (res.status !== 503 || attempt >= RETRIES) throw new SupplierError(`供應商回 ${res.status}（第 ${attempt + 1} 次）`)
    const wait = retryAfterMs(res.headers.get('retry-after')) ?? BASE_DELAY_MS * 2 ** attempt
    if (wait > MAX_RETRY_AFTER_MS) throw new SupplierError(`供應商要求 ${wait}ms 後再試，超過上限`)
    await sleep(wait, undefined, { signal })
  }
}

export async function getRestock({ res, params, pool, config, logger }: Ctx) {
  const id = Number(params[0])
  const { rowCount } = await pool.query('SELECT 1 FROM products WHERE id = $1', [id])
  if (!rowCount) throw new HttpError('not-found', `沒有編號 ${id} 的商品`)   // 我們自己沒有的商品，不用問上游

  // 回應關閉時（客戶端離開，或我們已經回完）取消還在進行的上游請求
  const client = new AbortController()
  try {
    const { restockAt } = await fetchRestock(`${config.supplierUrl}/restock/${id}`, client.signal)
    sendJson(res, 200, { productId: id, restockAt })
  } catch (err) {
    if (client.signal.aborted) return   // 客戶端已經走了，沒有人在等回應
    logger.warn('supplier failed', { productId: id, err })   // 上游的細節只進 log
    throw new HttpError('upstream-unavailable', '暫時查不到補貨時間，請稍後再試', { headers: { 'retry-after': '5' } })
  }
}
