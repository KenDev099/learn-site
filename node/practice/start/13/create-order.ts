import { createServer } from 'node:http'
import type { MenuItem } from './menu.ts'
import { sendError, sendJson } from './http-utils.ts'

export const BODY_LIMIT = 10 * 1024   // 10KB

// 練習 2：POST /orders 建立訂單
// 現在的寫法有四個問題：沒有大小上限、中文可能被切壞、JSON 壞掉伺服器就倒、沒有驗證欄位
export function createApp(menu: MenuItem[]) {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/orders') return sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
    if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', '不支援這個方法', { headers: { allow: 'POST' } })

    let text = ''
    for await (const chunk of req) text += chunk
    const data = JSON.parse(text)
    sendJson(res, 201, { order: { drink: data.drink, qty: data.qty } })
  })
}
