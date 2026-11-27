// 練習 2：前端說「上傳好了」之後，伺服器自己確認
// confirmUpload(pool, store, receiptId) 回傳處理後的狀態：
//   - 沒有這筆紀錄：丟 ReceiptNotFoundError
//   - 已經是 uploaded 或 rejected：直接回傳目前狀態，不再呼叫 S3（重複呼叫要冪等）
//   - pending：用 HeadObject 讀物件的實際大小（ContentLength）與型別（ContentType）
//       物件不存在（錯誤的 name 是 'NotFound'）→ 丟 ObjectMissingError，紀錄維持 pending
//       大小 > MAX_SIZE，或型別跟紀錄的 content_type 不同 → 刪除物件、狀態改 rejected，回傳 'rejected'
//       都符合 → 狀態改 uploaded、uploaded_at = now()、size 改成實際大小，回傳 'uploaded'
//   更新狀態時加上 status = 'pending' 條件，兩個請求同時確認也只會處理一次
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import type pg from 'pg'
import { MAX_SIZE, ObjectMissingError, ReceiptNotFoundError, type Status, type Store } from './receipts.ts'

export async function confirmUpload(pool: pg.Pool, store: Store, receiptId: number): Promise<Status> {
  const { rows } = await pool.query<{ s3_key: string; content_type: string; status: Status; size: number }>(
    'SELECT s3_key, content_type, status, size FROM receipts WHERE id = $1', [receiptId])
  const r = rows[0]
  if (!r) throw new ReceiptNotFoundError(`沒有收據 ${receiptId}`)
  if (r.status !== 'pending') return r.status

  let head
  try {
    head = await store.s3.send(new HeadObjectCommand({ Bucket: store.bucket, Key: r.s3_key }))
  } catch (e) {
    if ((e as Error).name === 'NotFound') throw new ObjectMissingError(`收據 ${receiptId} 的檔案還沒上傳`)
    throw e
  }
  const size = r.size
  if (size > MAX_SIZE || head.ContentType !== r.content_type) {
    await store.s3.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: r.s3_key }))
    await pool.query(`UPDATE receipts SET status = 'rejected' WHERE id = $1 AND status = 'pending'`, [receiptId])
    return 'rejected'
  }
  await pool.query(
    `UPDATE receipts SET status = 'uploaded', uploaded_at = now(), size = $2 WHERE id = $1 AND status = 'pending'`,
    [receiptId, size])
  return 'uploaded'
}
