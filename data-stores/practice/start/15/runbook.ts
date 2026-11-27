// 練習 4：runbook 用的兩個工具
//
// rebuildSearch(deps, newIndex)：從 PostgreSQL 重建菜單索引，搜尋全程不中斷，回傳寫入的商品數
//   1. 查出別名 deps.index 目前指向哪些索引（可能一個都沒有：索引被誤刪時別名也跟著消失）
//   2. 用 MENU_MAPPINGS 建立 newIndex
//   3. 讀 products 全部（id, name, category, price, available, sold, version），一個 bulk 寫進 newIndex，
//      每筆帶 version 與 version_type: 'external'；逐筆檢查結果，有失敗就丟錯（不要切換）
//   4. refresh newIndex
//   5. 用「一個」updateAliases 請求：把別名從舊索引移除、加到 newIndex
//   6. 刪除舊索引
//
// findMissingReceipts(deps, now)：找出缺收據的訂單、重新排入 outbox，回傳訂單 id（由小到大）
//   - 範圍：created_at 早於 now - RECEIPT_GRACE_MS 的訂單（剛付款的還在等 worker，不算）
//   - 缺收據：receipt_key 是 NULL，或 receipt_key 指向的物件不在 bucket 裡（列出 receipts/ 底下的物件來比對，記得分頁）
//   - 每筆缺收據的訂單排入一個 order.paid 事件；已經有待處理事件的訂單不能多一筆（outbox 有部分唯一索引，用 ON CONFLICT DO NOTHING）
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { MENU_MAPPINGS, RECEIPT_GRACE_MS, type Deps, type MenuDoc } from './schema.ts'

export async function rebuildSearch(deps: Deps, newIndex: string): Promise<number> {
  // 寫在這裡
  return 0
}

export async function findMissingReceipts(deps: Deps, now: number): Promise<number[]> {
  // 寫在這裡
  return []
}
