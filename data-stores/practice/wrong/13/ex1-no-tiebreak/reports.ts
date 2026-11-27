// 練習 1：在 DuckDB 裡做營運報表
// dir 裡有兩個 CSV（第一列是欄名）：
//   orders.csv       id, store_id, customer_id, ordered_at（例如 2026-03-05 14:07:09.250）, total（例如 96.8，88 折會有小數）, prep_ms（製作時間，毫秒）
//   order_items.csv  order_id, product_id, quantity, unit_price
// loadCsv 用 read_csv 建立 orders、order_items 兩張表；total 一定要是 DECIMAL(10,1)，不能讓 DuckDB 自己猜成 DOUBLE
// 三個報表函式「各自只能呼叫一次 duck.runAndReadAll」，計算全部寫在 SQL 裡，回傳的列數就是 SQL 查出的列數
// 讀結果：reader.getRowObjectsJson() 把 BIGINT、DECIMAL、DATE 轉成字串（例如 '830'、'12345.6'、'2026-01-01'）
import type { DuckDBConnection } from '@duckdb/node-api'
import { join } from 'node:path'

export type DailyRevenue = { day: string; orders: number; revenue: string }       // day：'2026-01-01'；revenue：精確的金額字串，例如 '81234.4'
export type TopProduct = { month: string; product_id: number; qty: number; rank: number }  // month：'2026-01'；rank：1、2、3
export type PrepP95 = { store_id: number; p95_ms: number }

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`

export async function loadCsv(duck: DuckDBConnection, dir: string): Promise<void> {
  await duck.run(`CREATE TABLE orders AS
    SELECT * FROM read_csv(${quote(join(dir, 'orders.csv'))}, header = true, columns = {
      'id': 'BIGINT', 'store_id': 'INTEGER', 'customer_id': 'INTEGER',
      'ordered_at': 'TIMESTAMP', 'total': 'DECIMAL(10,1)', 'prep_ms': 'INTEGER'
    })`)
  await duck.run(`CREATE TABLE order_items AS
    SELECT * FROM read_csv(${quote(join(dir, 'order_items.csv'))}, header = true, columns = {
      'order_id': 'BIGINT', 'product_id': 'INTEGER', 'quantity': 'INTEGER', 'unit_price': 'DECIMAL(10,1)'
    })`)
}

export async function dailyRevenue(duck: DuckDBConnection): Promise<DailyRevenue[]> {
  const reader = await duck.runAndReadAll(`
    SELECT CAST(ordered_at AS DATE) AS day, COUNT(*) AS orders, SUM(total) AS revenue
    FROM orders
    GROUP BY day
    ORDER BY day`)
  return reader.getRowObjectsJson().map(r => ({ day: String(r.day), orders: Number(r.orders), revenue: String(r.revenue) }))
}

export async function topProducts(duck: DuckDBConnection): Promise<TopProduct[]> {
  const reader = await duck.runAndReadAll(`
    WITH monthly AS (
      SELECT strftime(o.ordered_at, '%Y-%m') AS month, i.product_id, SUM(i.quantity) AS qty
      FROM order_items i JOIN orders o ON o.id = i.order_id
      GROUP BY month, i.product_id
    )
    SELECT month, product_id, qty,
           ROW_NUMBER() OVER (PARTITION BY month ORDER BY qty DESC) AS rank
    FROM monthly
    QUALIFY rank <= 3
    ORDER BY month, rank`)
  return reader.getRowObjectsJson().map(r => ({ month: String(r.month), product_id: Number(r.product_id), qty: Number(r.qty), rank: Number(r.rank) }))
}

export async function prepP95(duck: DuckDBConnection): Promise<PrepP95[]> {
  const reader = await duck.runAndReadAll(`
    SELECT store_id, quantile_cont(prep_ms, 0.95) AS p95_ms
    FROM orders
    GROUP BY store_id
    ORDER BY store_id`)
  return reader.getRowObjectsJson().map(r => ({ store_id: Number(r.store_id), p95_ms: Number(r.p95_ms) }))
}
