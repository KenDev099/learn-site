// 練習 4：替報表需求選方案
// 每個需求給四個數字／旗標：
//   rowsScanned       沒有適合的索引時，查詢要掃過的列數
//   rowsAfterIndex    用最適合的索引能把要讀的列縮到幾列（做不到就等於 rowsScanned）
//   maxStaleSeconds   報表可以接受資料落後幾秒（0 = 要看到剛剛那一筆）
//   fixedQuery        true：每次都是同一個查詢（固定的儀表板）；false：常常有臨時的新查詢
// 依序套用，第一條成立的就是答案：
//   1. rowsAfterIndex ≤ 10,000                       → 'postgres-index'     加索引就夠，留在主資料庫
//   2. maxStaleSeconds < 3,600（要比 1 小時還新）       → 'read-replica'       物化檢視每小時更新、ETL 每晚跑，都太舊
//   3. rowsScanned ≥ 50,000,000                       → 'olap'               量大、可以接受 1 小時以上的延遲：每晚 ETL 到分析資料庫
//   4. fixedQuery                                     → 'materialized-view'  固定查詢，結果先算好存起來
//   5. 其他                                           → 'read-replica'
export type Plan = 'postgres-index' | 'materialized-view' | 'read-replica' | 'olap'
export type ReportNeed = { name: string; rowsScanned: number; rowsAfterIndex: number; maxStaleSeconds: number; fixedQuery: boolean }

export function choose(need: ReportNeed): Plan {
  if (need.rowsAfterIndex <= 10_000) return 'postgres-index'
  if (need.rowsScanned >= 50_000_000) return 'olap'
  if (need.fixedQuery) return 'materialized-view'
  return 'read-replica'
}

// 咖啡店的五個報表需求：寫完可以用 node --test 看看結果，或自己先猜每一個的答案
export const NEEDS: ReportNeed[] = [
  { name: '某位顧客的訂單紀錄', rowsScanned: 2_000_000, rowsAfterIndex: 40, maxStaleSeconds: 0, fixedQuery: true },
  { name: '門市即時待做清單', rowsScanned: 2_000_000, rowsAfterIndex: 300_000, maxStaleSeconds: 5, fixedQuery: true },
  { name: '老闆的本月營收儀表板', rowsScanned: 2_000_000, rowsAfterIndex: 2_000_000, maxStaleSeconds: 3_600, fixedQuery: true },
  { name: '三年所有訂單明細的品項分析', rowsScanned: 80_000_000, rowsAfterIndex: 80_000_000, maxStaleSeconds: 86_400, fixedQuery: false },
  { name: '行銷臨時要的上週會員分析', rowsScanned: 2_000_000, rowsAfterIndex: 900_000, maxStaleSeconds: 86_400, fixedQuery: false },
]
