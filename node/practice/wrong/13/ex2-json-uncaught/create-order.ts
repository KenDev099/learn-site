import { createServer, type IncomingMessage } from 'node:http'
import type { MenuItem } from './menu.ts'
import { sendError, sendJson, type FieldError } from './http-utils.ts'

export const BODY_LIMIT = 10 * 1024   // 10KB

// 練習 2：POST /orders 建立訂單
export function createApp(menu: MenuItem[]) {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/orders') return sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
    if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', '不支援這個方法', { headers: { allow: 'POST' } })

    // 1. 格式：只收 JSON（可以帶 ; charset=utf-8）
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'application/json') return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type 要是 application/json')

    // 2. 大小：一邊收一邊算，超過就停，不讀完剩下的
    const body = await readBody(req, BODY_LIMIT)
    if (body === null) {
      return sendError(res, 413, 'PAYLOAD_TOO_LARGE', `body 不能超過 ${BODY_LIMIT} 位元組`, { headers: { connection: 'close' } })
    }

    // 3. JSON：所有 Buffer 接起來之後才解碼
    const data: unknown = JSON.parse(body.toString('utf8'))

    // 4. 欄位：一次列出所有錯誤
    const input = typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {}
    const details: FieldError[] = []
    const { drink, qty } = input
    if (typeof drink !== 'string' || !menu.some(m => m.name === drink)) details.push({ field: 'drink', message: 'drink 要是菜單上的品項' })
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 20) details.push({ field: 'qty', message: 'qty 要是 1 到 20 的整數' })
    if (details.length) return sendError(res, 400, 'VALIDATION', '資料格式不對', { details })

    sendJson(res, 201, { order: { drink, qty } })
  })
}

// 收集 body；超過 limit 回傳 null（離開 for await 時 Node 會關掉這個請求，不再讀剩下的）
async function readBody(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
