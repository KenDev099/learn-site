import { createServer } from 'node:http'
import type { MenuItem } from './menu.ts'
import { readJson, sendJson, sendProblem } from './http-utils.ts'
import { etagOf } from './etag.ts'

type ItemInput = { name: string, nameEn: string, price: number }

function isItemInput(v: unknown): v is ItemInput {
  const o = v as Partial<ItemInput> | null
  return typeof o === 'object' && o !== null &&
    typeof o.name === 'string' && o.name.length > 0 &&
    typeof o.nameEn === 'string' && o.nameEn.length > 0 &&
    Number.isInteger(o.price) && (o.price as number) > 0
}

// If-Match 用強比較（strong comparison）：W/ 開頭的弱 ETag 永遠不算相符
function ifMatch(header: string, etag: string) {
  if (header.trim() === '*') return true
  return header.trim() === etag
}

// 練習 3：GET /menu/:id 回品項和 ETag；PUT /menu/:id 整個換掉品項內容，一定要帶 If-Match
export function createApp(menu: MenuItem[]) {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const m = pathname.match(/^\/menu\/(\d+)$/)
    const item = m ? menu.find(i => i.id === Number(m[1])) : undefined
    if (!item) return sendProblem(res, 404, 'Not Found', '找不到這個品項')

    if (req.method === 'GET') return sendJson(res, 200, item, { etag: etagOf(JSON.stringify(item)) })
    if (req.method !== 'PUT') return sendProblem(res, 405, 'Method Not Allowed', '只支援 GET、PUT', { allow: 'GET, PUT' })

    const condition = req.headers['if-match']
    if (!condition) return sendProblem(res, 428, 'Precondition Required', '修改前先 GET 拿到 ETag，再放進 If-Match 標頭重送')

    const data = await readJson(req)
    if (!isItemInput(data)) return sendProblem(res, 400, 'Bad Request', 'body 要是 { name, nameEn, price }，price 是正整數')

    // 比對和修改之間不能有 await：讀完 body 才比對，比對完立刻改
    if (!ifMatch(condition, etagOf(JSON.stringify(item)))) {
      return sendProblem(res, 412, 'Precondition Failed', '這個品項在你讀取之後被改過了，請重新 GET 再修改')
    }
    Object.assign(item, { name: data.name, nameEn: data.nameEn, price: data.price })
    sendJson(res, 200, item, { etag: etagOf(JSON.stringify(item)) })
  })
}
