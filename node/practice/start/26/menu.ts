// 練習 2：菜單
// GET /menu?limit=&cursor=
//   回 { items: [{ id, name, price }], nextCursor }，依 id 排序；limit 預設 20、1–50；nextCursor 是不透明字串，最後一頁是 null
//   cursor 分頁（第 14 課）：中途有商品被刪掉，也不能重複或漏掉；limit、cursor 不對回 400 validation
//   帶 ETag（依回應內容計算）與 Cache-Control: public, max-age=60；If-None-Match 相同回 304、沒有 body（第 15 課）
// GET /menu/:id
//   回 { id, name, price }，同樣帶 ETag、支援 304；不存在丟 HttpError('not-found', …)
import { HttpError, sendJson, type Ctx } from './platform/http.ts'

type MenuItem = { id: number, name: string, price: number }

export async function listMenu({ res, pool }: Ctx) {
  // TODO：現在一次回全部，沒有分頁也沒有快取標頭
  const { rows } = await pool.query<MenuItem>('SELECT id, name, price FROM products ORDER BY id')
  sendJson(res, 200, { items: rows, nextCursor: null })
}

export async function getMenuItem({ res, params, pool }: Ctx) {
  const id = Number(params[0])
  // TODO：找不到要回 404；加上 ETag 與 304
  const { rows } = await pool.query<MenuItem>('SELECT id, name, price FROM products WHERE id = $1', [id])
  sendJson(res, 200, rows[0] ?? null)
}
