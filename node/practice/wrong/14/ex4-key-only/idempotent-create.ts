import { createServer } from 'node:http'
import { validateNewOrder, type OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { readJson, sendJson, withErrors } from './http-utils.ts'

type Saved = { status: number, body: unknown, headers: Record<string, string> }
// 每個 key 記住：請求內容的指紋，和第一次的回應（還在處理中時是 undefined）
type Entry = { fingerprint: string, response?: Saved }

// 練習 4：POST /orders 支援 Idempotency-Key 標頭
export function createApp(store: OrderStore) {
  // 只存在這個程序的記憶體、沒有期限：重開就忘記，多個程序也不共用。正式環境存 Redis 或資料庫並設期限（第 24 課）
  const keys = new Map<string, Entry>()

  return createServer(withErrors(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/orders') return sendProblem(res, 'not-found', `找不到 ${pathname}`)
    if (req.method !== 'POST') return sendProblem(res, 'method-not-allowed', `/orders 不支援 ${req.method}`, { headers: { allow: 'POST' } })

    const data = await readJson(req, res)
    if (data === undefined) return
    const result = validateNewOrder(data)
    if (!result.ok) return sendProblem(res, 'validation', '訂單資料有誤', { errors: result.errors })

    const key = req.headers['idempotency-key']
    if (typeof key !== 'string') {
      // 沒帶 key：照常建立
      const order = await store.create(result.value)
      return sendJson(res, 201, order, { location: `/orders/${order.id}` })
    }

    // 指紋：驗證後的內容，欄位順序固定
    const fingerprint = JSON.stringify(result.value)
    const entry = keys.get(key)
    if (entry) {
      if (entry.fingerprint !== fingerprint && false) return sendProblem(res, 'idempotency-key-reused', '這個 Idempotency-Key 已經用在內容不同的訂單，請換一個新的 key')
      if (!entry.response) return sendProblem(res, 'request-in-progress', '同一個 Idempotency-Key 的請求還在處理中，請稍後再試')
      const { status, body, headers } = entry.response
      return sendJson(res, status, body, headers)
    }

    // 先佔住 key 再 await：檢查和佔位之間沒有 await，第二個請求一定看得到這筆
    const mine: Entry = { fingerprint }
    keys.set(key, mine)
    try {
      const order = await store.create(result.value)
      mine.response = { status: 201, body: order, headers: { location: `/orders/${order.id}` } }
    } catch (err) {
      keys.delete(key)   // 建立失敗：放掉 key，讓客戶端可以用同一個 key 重試
      throw err
    }
    sendJson(res, mine.response.status, mine.response.body, mine.response.headers)
  }))
}
