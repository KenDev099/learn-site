// 練習 3：發下載網址
// getReceiptUrl(pool, store, receiptId, customerId, now)：
//   - 收據不存在，或它的訂單（orders.customer_id）不是這位客人：丟 ForbiddenError（兩種情況回一樣的錯，不讓人試出哪些 id 存在）
//   - 狀態不是 uploaded：丟 ReceiptNotReadyError
//   - 回傳 GET 的 presigned URL：有效 DOWNLOAD_TTL 秒、簽章時間是 now，
//     下載時回應標頭 Content-Disposition 是 attachment; filename="receipt-<orderId>.pdf"
import type pg from 'pg'
import type { Store } from './receipts.ts'

export async function getReceiptUrl(pool: pg.Pool, store: Store, receiptId: number, customerId: number, now: number): Promise<string> {
  // 寫在這裡
  return ''
}
