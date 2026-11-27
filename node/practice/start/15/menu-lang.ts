import { createServer } from 'node:http'
import type { MenuItem } from './menu.ts'
import { sendJson, sendProblem } from './http-utils.ts'
import { etagOf, noneMatch } from './etag.ts'

// 練習 2：GET /menu 依 Accept-Language 回中文（zh-TW，預設）或英文（en）品名
// 回應的每個品項是 { id, name, price }，name 是選到的語言的品名
// 現在只會回中文，也沒有 ETag
export function createApp(menu: MenuItem[]) {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/menu') return sendProblem(res, 404, 'Not Found', '找不到這個路徑')
    if (req.method !== 'GET') return sendProblem(res, 405, 'Method Not Allowed', '只支援 GET', { allow: 'GET' })

    const items = menu.map(({ id, name, price }) => ({ id, name, price }))
    sendJson(res, 200, items)
  })
}
