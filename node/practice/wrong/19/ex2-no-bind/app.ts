// 練習 2：每個請求的 log 都要帶上自己的 requestId
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Kitchen } from './kitchen.ts'
import { checkStock } from './supplier.ts'

export type Write = (line: string) => void

const als = new AsyncLocalStorage<{ requestId: string }>()
// 外面送來的 id 只接受英數字、-、_、.，長度 1 到 64；其他一律自己產生
const VALID_ID = /^[A-Za-z0-9_.-]{1,64}$/

export function createApp(write: Write) {
  const kitchen = new Kitchen()
  const log = (msg: string, fields: Record<string, unknown> = {}) => {
    write(JSON.stringify({ msg, requestId: als.getStore()?.requestId, ...fields }) + '\n')
  }

  // GET /brew?drink=拿鐵&ms=30：查庫存（ms 毫秒）→ 交給廚房 → 做好才回應
  return createServer((req, res) => {
    const incoming = req.headers['x-request-id']
    const requestId = typeof incoming === 'string' && VALID_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('x-request-id', requestId)
    als.run({ requestId }, async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const drink = url.searchParams.get('drink') ?? '美式咖啡'
      const ms = Number(url.searchParams.get('ms') ?? 0)

      log('收到訂單', { drink })
      const inStock = await checkStock(drink, ms)
      log('庫存確認', { drink, inStock })

      const ticket = kitchen.order(drink)
      // 監聽器會在 emit 的 context 執行（別的請求開的批次），bind 把它綁回這個請求
      kitchen.once(`ready:${ticket}`, () => {
        log('製作完成', { drink, ticket })
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ drink, ticket }))
      })
    })
  })
}
