import { createServer } from 'node:http'
import type { MenuItem } from './menu.ts'
import { sendError, sendJson } from './http-utils.ts'

// 練習 1：GET /menu、GET /menu/:id，其他路徑 404，方法不對 405＋Allow
// 菜單由外面傳進來（測試會傳自己的菜單）
export function createApp(menu: MenuItem[]) {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/menu') return sendJson(res, 200, menu)
    sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
  })
}
