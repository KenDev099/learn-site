// 練習 2：菜單。GET /menu（cursor 分頁、ETag、Cache-Control）與 GET /menu/:id
import { hash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError, sendJson, type Ctx, type FieldError } from './platform/http.ts'

type MenuItem = { id: number, name: string, price: number }
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// cursor 是「上一頁最後一筆的 id」包成 base64url：客戶端只要原樣帶回來，不用懂內容（第 14 課）
const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ id: offset })).toString('base64url')
function decodeCursor(s: string): number | undefined {
  try {
    const { id } = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (Number.isInteger(id) && id > 0) return id
  } catch {}
  return undefined
}

// 內容一樣 ETag 就一樣；客戶端帶著相同的 If-None-Match 來就回 304、不帶 body（第 15 課）
function sendCacheable(req: IncomingMessage, res: ServerResponse, data: unknown) {
  const body = JSON.stringify(data)
  const etag = `"${hash('sha256', body, 'base64url')}"`
  const headers = { etag, 'cache-control': 'public, max-age=60' }
  const inm = req.headers['if-none-match']
  if (inm && inm.split(',').some(t => t.trim().replace(/^W\//, '') === etag)) {
    res.writeHead(304, headers)
    return void res.end()
  }
  sendJson(res, 200, data, headers)
}

export async function listMenu({ req, res, url, pool }: Ctx) {
  const errors: FieldError[] = []
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
  if (!/^\d+$/.test(rawLimit ?? '20') || limit < 1 || limit > MAX_LIMIT) errors.push({ field: 'limit', message: `limit 要是 1 到 ${MAX_LIMIT} 的整數` })
  const rawCursor = url.searchParams.get('cursor')
  const after = rawCursor === null ? 0 : decodeCursor(rawCursor)
  if (after === undefined) errors.push({ field: 'cursor', message: 'cursor 不正確，請用上一頁回傳的 nextCursor' })
  if (errors.length) throw new HttpError('validation', '查詢參數有誤', { errors })

  // keyset 分頁：從上一頁最後一筆之後開始，多拿一筆判斷還有沒有下一頁
  const { rows } = await pool.query<MenuItem>(
    'SELECT id, name, price FROM products ORDER BY id OFFSET $1 LIMIT $2', [after, limit + 1])
  const items = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? encodeCursor((after ?? 0) + limit) : null
  sendCacheable(req, res, { items, nextCursor })
}

export async function getMenuItem({ req, res, params, pool }: Ctx) {
  const id = Number(params[0])
  const { rows } = await pool.query<MenuItem>('SELECT id, name, price FROM products WHERE id = $1', [id])
  if (!rows[0]) throw new HttpError('not-found', `沒有編號 ${id} 的商品`)
  sendCacheable(req, res, rows[0])
}
