// ✗ 沒有用 AsyncLocalStorage：每個請求自己的閉包帶著 requestId（一路傳參數）。行為對，但題目要練 AsyncLocalStorage
// 練習 2：每個請求的 log 都要帶上自己的 requestId
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Kitchen } from './kitchen.ts'
import { checkStock } from './supplier.ts'

export type Write = (line: string) => void

// 外面送來的 id 只接受英數字、-、_、.，長度 1 到 64；其他一律自己產生
const VALID_ID = /^[A-Za-z0-9_.-]{1,64}$/

export function createApp(write: Write) {
  const kitchen = new Kitchen()

  // GET /brew?drink=拿鐵&ms=30：查庫存（ms 毫秒）→ 交給廚房 → 做好才回應
  return createServer((req, res) => {
    const incoming = req.headers['x-request-id']
    const requestId = typeof incoming === 'string' && VALID_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('x-request-id', requestId)
    const log = (msg: string, fields: Record<string, unknown> = {}) => {
      write(JSON.stringify({ msg, requestId, ...fields }) + '\n')
    }
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const drink = url.searchParams.get('drink') ?? '美式咖啡'
      const ms = Number(url.searchParams.get('ms') ?? 0)

      log('收到訂單', { drink })
      const inStock = await checkStock(drink, ms)
      log('庫存確認', { drink, inStock })

      const ticket = kitchen.order(drink)
      kitchen.once(`ready:${ticket}`, (() => {
        log('製作完成', { drink, ticket })
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ drink, ticket }))
      }))
    })()
  })
}
