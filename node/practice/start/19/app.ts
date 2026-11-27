// 練習 2：每個請求的 log 都要帶上自己的 requestId
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Kitchen } from './kitchen.ts'
import { checkStock } from './supplier.ts'

export type Write = (line: string) => void

// ✗ 模組層級的變數：同時有很多請求在處理時，會被別的請求覆蓋
let currentRequestId = ''

export function createApp(write: Write) {
  const kitchen = new Kitchen()
  const log = (msg: string, fields: Record<string, unknown> = {}) => {
    write(JSON.stringify({ msg, requestId: currentRequestId, ...fields }) + '\n')
  }

  // GET /brew?drink=拿鐵&ms=30：查庫存（ms 毫秒）→ 交給廚房 → 做好才回應
  return createServer(async (req, res) => {
    currentRequestId = String(req.headers['x-request-id'] ?? randomUUID())
    res.setHeader('x-request-id', currentRequestId)
    const url = new URL(req.url ?? '/', 'http://localhost')
    const drink = url.searchParams.get('drink') ?? '美式咖啡'
    const ms = Number(url.searchParams.get('ms') ?? 0)

    log('收到訂單', { drink })
    const inStock = await checkStock(drink, ms)
    log('庫存確認', { drink, inStock })

    const ticket = kitchen.order(drink)
    kitchen.once(`ready:${ticket}`, () => {
      log('製作完成', { drink, ticket })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ drink, ticket }))
    })
  })
}
