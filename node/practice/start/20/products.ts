// 練習 2：搜尋商品
import type pg from 'pg'
import { ValidationError } from './errors.ts'

export type Product = { id: number, name: string, price: number }
export type SearchOptions = { q: string, sort?: string, limit?: number }

// TODO：
// - 品名包含 q（不分大小寫）；q 裡的 %、_、\ 都當一般字元
// - sort 只接受 price_asc、price_desc、name（預設 name），其他丟 ValidationError（field 'sort'）
// - limit 是 1 到 50 的整數（預設 20），其他丟 ValidationError（field 'limit'）
// - 回傳 { items, total }：total 是符合條件的總筆數（不受 limit 影響），是 number
export async function searchProducts(pool: pg.Pool, { q, sort = 'name', limit = 20 }: SearchOptions) {
  const where = `name ILIKE '%${q}%'`
  const items = await pool.query<Product>(`SELECT id, name, price FROM products WHERE ${where} ORDER BY ${sort} LIMIT ${limit}`)
  const count = await pool.query(`SELECT count(*) AS total FROM products WHERE ${where}`)
  return { items: items.rows, total: count.rows[0].total }
}
