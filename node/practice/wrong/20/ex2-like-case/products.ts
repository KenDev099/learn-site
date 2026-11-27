// 練習 2：搜尋商品
import type pg from 'pg'
import { ValidationError } from './errors.ts'

export type Product = { id: number, name: string, price: number }
export type SearchOptions = { q: string, sort?: string, limit?: number }

// 欄位名稱和排序方向不能用 $1，只能從白名單挑；最後用 id 讓順序固定
const SORTS: Record<string, string> = {
  price_asc: 'price ASC, id ASC',
  price_desc: 'price DESC, id ASC',
  name: 'name ASC, id ASC',
}

// LIKE 的萬用字元 % 和 _，以及跳脫字元 \ 本身，前面都加上 \
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

export async function searchProducts(pool: pg.Pool, { q, sort = 'name', limit = 20 }: SearchOptions) {
  if (!Object.hasOwn(SORTS, sort)) throw new ValidationError('sort 只能是 price_asc、price_desc、name', 'sort')
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ValidationError('limit 要是 1 到 50 的整數', 'limit')
  const pattern = `%${escapeLike(q)}%`
  const where = `name LIKE $1 ESCAPE '\\'`
  const items = await pool.query<Product>(
    `SELECT id, name, price FROM products WHERE ${where} ORDER BY ${SORTS[sort]} LIMIT $2`, [pattern, limit])
  // count(*) 是 bigint，pg 回傳字串
  const count = await pool.query<{ total: string }>(`SELECT count(*) AS total FROM products WHERE ${where}`, [pattern])
  return { items: items.rows, total: Number(count.rows[0].total) }
}
