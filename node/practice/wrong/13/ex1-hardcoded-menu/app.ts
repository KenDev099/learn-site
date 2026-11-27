import { createServer } from 'node:http'
import { MENU, type MenuItem } from './menu.ts'
import { sendError, sendJson } from './http-utils.ts'

// 練習 1：GET /menu、GET /menu/:id，其他路徑 404，方法不對 405＋Allow
// 菜單由外面傳進來（測試會傳自己的菜單）
export function createApp(menu: MenuItem[]) {
  return createServer((req, res) => {
    // req.url 是「路徑＋查詢字串」，先拆開，只拿 pathname 比對
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

    if (pathname === '/menu') {
      if (req.method !== 'GET') return methodNotAllowed(res)
      return sendJson(res, 200, MENU)
    }

    const match = /^\/menu\/(\d+)$/.exec(pathname)
    if (match) {
      if (req.method !== 'GET') return methodNotAllowed(res)
      const item = MENU.find(m => m.id === Number(match[1]))
      if (!item) return sendError(res, 404, 'NOT_FOUND', '找不到這個品項')
      return sendJson(res, 200, item)
    }

    sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
  })
}

function methodNotAllowed(res: Parameters<typeof sendJson>[0]) {
  sendError(res, 405, 'METHOD_NOT_ALLOWED', '不支援這個方法', { headers: { allow: 'GET' } })
}
