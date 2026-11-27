import { createServer } from 'node:http'
import type { MenuItem } from './menu.ts'
import { sendJson, sendProblem } from './http-utils.ts'
import { etagOf, noneMatch } from './etag.ts'

// 練習 1：GET /menu 加上 ETag、Cache-Control，If-None-Match 命中時回 304
// menu 是外面傳進來的陣列，之後可能被改（漲價），每次請求都要看最新的內容
export function createApp(menu: MenuItem[]) {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/menu') return sendProblem(res, 404, 'Not Found', '找不到這個路徑')
    if (req.method !== 'GET') return sendProblem(res, 405, 'Method Not Allowed', '只支援 GET', { allow: 'GET' })

    // 每次請求都用目前的內容算，菜單改了 ETag 才會跟著變
    const headers = { etag: etagOf(JSON.stringify(menu)), 'cache-control': 'public, max-age=60' }
    if (noneMatch(req.headers['if-none-match'], headers.etag)) {
      res.writeHead(304)   // 304 沒有 body，但 200 會帶的 ETag、Cache-Control 要照樣帶
      return res.end()
    }
    sendJson(res, 200, menu, headers)
  })
}
