// 練習 2：前端說「上傳好了」之後，伺服器自己確認
// confirmUpload(pool, store, receiptId) 回傳處理後的狀態：
//   - 沒有這筆紀錄：丟 ReceiptNotFoundError
//   - 已經是 uploaded 或 rejected：直接回傳目前狀態，不再呼叫 S3（重複呼叫要冪等）
//   - pending：用 HeadObject 讀物件的實際大小（ContentLength）與型別（ContentType）
//       物件不存在（錯誤的 name 是 'NotFound'）→ 丟 ObjectMissingError，紀錄維持 pending
//       大小 > MAX_SIZE，或型別跟紀錄的 content_type 不同 → 刪除物件、狀態改 rejected，回傳 'rejected'
//       都符合 → 狀態改 uploaded、uploaded_at = now()、size 改成實際大小，回傳 'uploaded'
//   更新狀態時加上 status = 'pending' 條件，兩個請求同時確認也只會處理一次
import type pg from 'pg'
import type { Status, Store } from './receipts.ts'

export async function confirmUpload(pool: pg.Pool, store: Store, receiptId: number): Promise<Status> {
  // 寫在這裡
  return 'pending'
}
