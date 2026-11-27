// 練習 1：在 DuckDB 裡做營運報表
// dir 裡有兩個 CSV（第一列是欄名）：
//   orders.csv       id, store_id, customer_id, ordered_at（例如 2026-03-05 14:07:09.250）, total（例如 96.8，88 折會有小數）, prep_ms（製作時間，毫秒）
//   order_items.csv  order_id, product_id, quantity, unit_price
// loadCsv 用 read_csv 建立 orders、order_items 兩張表；total 一定要是 DECIMAL(10,1)，不能讓 DuckDB 自己猜成 DOUBLE
// 三個報表函式「各自只能呼叫一次 duck.runAndReadAll」，計算全部寫在 SQL 裡，回傳的列數就是 SQL 查出的列數
// 讀結果：reader.getRowObjectsJson() 把 BIGINT、DECIMAL、DATE 轉成字串（例如 '830'、'12345.6'、'2026-01-01'）
import type { DuckDBConnection } from '@duckdb/node-api'

export type DailyRevenue = { day: string; orders: number; revenue: string }       // day：'2026-01-01'；revenue：精確的金額字串，例如 '81234.4'
export type TopProduct = { month: string; product_id: number; qty: number; rank: number }  // month：'2026-01'；rank：1、2、3
export type PrepP95 = { store_id: number; p95_ms: number }

export async function loadCsv(duck: DuckDBConnection, dir: string): Promise<void> {
  // 寫在這裡
}

// 每天的訂單數與營收（SUM(total)），依日期排序
export async function dailyRevenue(duck: DuckDBConnection): Promise<DailyRevenue[]> {
  // 寫在這裡
  return []
}

// 每個月銷量（SUM(quantity)）前 3 名的商品；銷量相同時 product_id 小的排前面；依 month、rank 排序
export async function topProducts(duck: DuckDBConnection): Promise<TopProduct[]> {
  // 寫在這裡
  return []
}

// 每家門市製作時間的第 95 百分位數：用 quantile_cont（連續、內插），依 store_id 排序
export async function prepP95(duck: DuckDBConnection): Promise<PrepP95[]> {
  // 寫在這裡
  return []
}
