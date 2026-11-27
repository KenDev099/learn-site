// 第 12 課共用的定義（不用改這個檔）：資料表、限制、錯誤類別
// 測試開始前會用 createTables 在 schema t12 建立兩張表
import type { S3Client } from '@aws-sdk/client-s3'
import type pg from 'pg'

// 物件儲存：哪個 client、哪個 bucket（測試用的 bucket 是 t12-receipts）
export type Store = { s3: S3Client; bucket: string }

export const PDF = 'application/pdf'
export const MAX_SIZE = 2 * 1024 * 1024        // 收據 PDF 最大 2 MB
export const UPLOAD_TTL = 5 * 60               // 上傳網址 5 分鐘（秒）
export const DOWNLOAD_TTL = 60                 // 下載網址 60 秒（秒）

// receipts.status：pending（發了上傳網址、還沒確認）→ uploaded（伺服器驗證過）或 rejected（驗證失敗、物件已刪）
export type Status = 'pending' | 'uploaded' | 'rejected'

export class UploadRejectedError extends Error {}   // createUpload：型別或大小不允許
export class ReceiptNotFoundError extends Error {}  // confirmUpload：沒有這筆收據紀錄
export class ObjectMissingError extends Error {}    // confirmUpload：紀錄在，但物件還沒上傳
export class ForbiddenError extends Error {}        // getReceiptUrl：不是本人的收據，或收據不存在
export class ReceiptNotReadyError extends Error {}  // getReceiptUrl：收據還不是 uploaded

export const SCHEMA = `
CREATE TABLE orders (
  id          integer PRIMARY KEY,
  customer_id integer NOT NULL
);
CREATE TABLE receipts (
  id           integer GENERATED ALWAYS AS IDENTITY (START WITH 101) PRIMARY KEY,
  order_id     integer NOT NULL REFERENCES orders(id),
  s3_key       text NOT NULL UNIQUE,              -- 物件在 bucket 裡的 key
  content_type text NOT NULL,                     -- 申請上傳時說好的型別
  size         integer NOT NULL,                  -- 前端申報的大小（只是申報，不可信）
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'rejected')),
  created_at   timestamptz NOT NULL,
  uploaded_at  timestamptz
);`

export async function createTables(pool: pg.Pool) {
  await pool.query(SCHEMA)
}
