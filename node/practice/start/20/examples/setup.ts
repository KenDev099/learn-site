// 把咖啡店的資料（含這課加的庫存與約束）放進 DATABASE_URL 指的資料庫；重跑會整個重建
// 執行：node --env-file=../../.env examples/setup.ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
await pool.query('DROP TABLE IF EXISTS order_items, orders, products, customers')
for (const file of [join(import.meta.dirname, '../../../helpers/coffee.sql'), join(import.meta.dirname, '../schema.sql')]) {
  await pool.query(await readFile(file, 'utf8'))
}
const { rows } = await pool.query('SELECT name, price, stock FROM products ORDER BY id')
console.table(rows)
await pool.end()
