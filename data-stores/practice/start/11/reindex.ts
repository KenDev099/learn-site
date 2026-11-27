// 練習 3：零停機重建索引：新索引 → 全量匯入 → 補上期間的變更 → 原子切換別名 → 刪舊索引
// reindexWithAlias(pool, es, alias, newIndex, mappings)：
//   1. 查出 alias 目前指向哪些索引（es.indices.getAlias({ name: alias })），不要寫死舊索引的名稱
//   2. 記下 outbox 目前最大的 id（匯入期間的變更會在它之後）
//   3. 用 mappings 建立 newIndex
//   4. 全量匯入：用 pool.query 一次讀出 products（練習資料只有幾十筆），bulk 寫進 newIndex，每筆帶 version 與 version_type: 'external'
//   5. 補上變更：outbox 裡 id 大於第 2 步記下的值的事件，照練習 2 的方式寫進 newIndex（不管 processed_at，版本號會擋掉重複與亂序）
//   6. refresh newIndex（不然剛寫的文件還搜不到）
//   7. 用「一個」es.indices.updateAliases 請求：移除舊索引的別名、把別名加到 newIndex
//   8. 再補一次第 5 步（切換前一刻才送到舊索引的變更）
//   9. 刪除舊索引
// bulk 的回應要檢查：除了 409、delete 的 404 之外有任何錯誤就丟錯，不要切換
import type { Pool } from 'pg'
import type { Client } from '@elastic/elasticsearch'

export async function reindexWithAlias(pool: Pool, es: Client, alias: string, newIndex: string, mappings: Record<string, unknown>): Promise<void> {
  // 寫在這裡
}
