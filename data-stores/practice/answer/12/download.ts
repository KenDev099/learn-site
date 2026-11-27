// 練習 3：發下載網址
// getReceiptUrl(pool, store, receiptId, customerId, now)：
//   - 收據不存在，或它的訂單（orders.customer_id）不是這位客人：丟 ForbiddenError（兩種情況回一樣的錯，不讓人試出哪些 id 存在）
//   - 狀態不是 uploaded：丟 ReceiptNotReadyError
//   - 回傳 GET 的 presigned URL：有效 DOWNLOAD_TTL 秒、簽章時間是 now，
//     下載時回應標頭 Content-Disposition 是 attachment; filename="receipt-<orderId>.pdf"
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type pg from 'pg'
import { DOWNLOAD_TTL, ForbiddenError, ReceiptNotReadyError, type Store } from './receipts.ts'

export async function getReceiptUrl(pool: pg.Pool, store: Store, receiptId: number, customerId: number, now: number): Promise<string> {
  const { rows } = await pool.query<{ s3_key: string; status: string; order_id: number }>(
    `SELECT r.s3_key, r.status, r.order_id
       FROM receipts r JOIN orders o ON o.id = r.order_id
      WHERE r.id = $1 AND o.customer_id = $2`,
    [receiptId, customerId])
  const r = rows[0]
  if (!r) throw new ForbiddenError('找不到這張收據')
  if (r.status !== 'uploaded') throw new ReceiptNotReadyError('收據還沒準備好')
  return getSignedUrl(store.s3, new GetObjectCommand({
    Bucket: store.bucket,
    Key: r.s3_key,
    ResponseContentDisposition: `attachment; filename="receipt-${r.order_id}.pdf"`,
  }), { expiresIn: DOWNLOAD_TTL, signingDate: new Date(now) })
}
