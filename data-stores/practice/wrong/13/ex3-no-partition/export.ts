// 練習 3：把一個月的訂單匯出成 Parquet，依門市分區
// duck 裡已經有 orders(id BIGINT, store_id INTEGER, customer_id INTEGER, ordered_at TIMESTAMP, total DECIMAL(10,1))
// exportMonth(duck, '2026-03', outDir)：
// 1. month 要符合 /^\d{4}-(0[1-9]|1[0-2])$/，不符合就丟錯
// 2. 只匯出 ordered_at 在那個月的訂單：>= 當月 1 日 00:00，而且 < 下個月 1 日 00:00（月底 23:59:59.999 也要算進去）
// 3. 用 COPY (SELECT …) TO outDir (FORMAT parquet, PARTITION_BY (store_id))：會產生 outDir/store_id=11/….parquet 這樣的檔案
//    outDir 是測試給的空資料夾，要組進 SQL 時把單引號寫成兩個（'' ）
// 4. 回傳 outDir 底下所有 .parquet 檔案的相對路徑（例如 'store_id=11/data_0.parquet'），由小到大排序
import type { DuckDBConnection } from '@duckdb/node-api'
import { readdirSync } from 'node:fs'

export async function exportMonth(duck: DuckDBConnection, month: string, outDir: string): Promise<string[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`month 要是 YYYY-MM，收到 ${month}`)
  await duck.run(`
    COPY (
      SELECT * FROM orders
      WHERE ordered_at >= CAST($1 AS DATE)
        AND ordered_at < CAST($1 AS DATE) + INTERVAL 1 MONTH
    ) TO '${outDir.replaceAll("'", "''")}/orders.parquet' (FORMAT parquet)`, [`${month}-01`])
  return readdirSync(outDir, { recursive: true }).map(String).filter(f => f.endsWith('.parquet')).sort()
}
