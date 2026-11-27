// 練習 3：實習生刪掉了一整個資料夾。bucket 有開版本控制：找出「目前是 delete marker」的物件，把那個 marker 刪掉來還原
import { S3Client } from '@aws-sdk/client-s3'

export async function restoreDeleted(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  // 1. ListObjectVersionsCommand 列出 prefix 底下的版本與 delete marker；IsTruncated 時用 NextKeyMarker、NextVersionIdMarker 繼續
  // 2. 只處理 IsLatest 為 true 的 delete marker
  // 3. DeleteObjectCommand 帶 VersionId（marker 的 VersionId）刪掉 marker，舊版本就重新變成目前版本
  // 4. 回傳還原的 key，依字母排序
  throw new Error('還沒寫')
}
