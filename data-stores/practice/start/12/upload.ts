// 練習 1：發上傳網址
// 1. createS3()：建立連到 Garage 的 S3Client。下面的起始寫法上傳一定失敗，看課程頁「SDK 的兩個坑」修好它
// 2. createUpload(pool, store, input)：
//    - contentType 只接受 PDF（application/pdf）、size 要是 1～MAX_SIZE 的整數，否則丟 UploadRejectedError，什麼都不寫
//    - key 格式 receipts/<yyyy>/<mm>/<uuid>.pdf（年月取自 now 的 UTC 時間，uuid 用 crypto.randomUUID()），不能用 fileName
//    - 先在 receipts 新增一筆 pending 紀錄（order_id、s3_key、content_type、size、created_at = now），再簽網址
//    - 回傳 PUT 的 presigned URL：有效 UPLOAD_TTL 秒、簽章時間是 now、Content-Type 要簽進去（換別的型別上傳要失敗）
import { S3Client } from '@aws-sdk/client-s3'
import type pg from 'pg'
import { S3_CONFIG } from '../../helpers/s3.ts'
import type { Store } from './receipts.ts'

export type UploadInput = {
  orderId: number
  fileName: string        // 使用者電腦上的檔名，只能拿來顯示，不能放進 key
  contentType: string
  size: number            // 前端申報的位元組數
  now: number             // 現在時間（毫秒），測試會傳入
}
export type UploadTicket = { receiptId: number; key: string; url: string }

export function createS3(): S3Client {
  return new S3Client(S3_CONFIG)
}

export async function createUpload(pool: pg.Pool, store: Store, input: UploadInput): Promise<UploadTicket> {
  // 寫在這裡
  return { receiptId: 0, key: '', url: '' }
}
