// 練習 3：實習生刪掉了一整個資料夾。bucket 有開版本控制：找出「目前是 delete marker」的物件，把那個 marker 刪掉來還原
import { DeleteObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3'

export async function restoreDeleted(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const markers: { Key: string, VersionId: string }[] = []
  let KeyMarker: string | undefined, VersionIdMarker: string | undefined
  do {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker, VersionIdMarker }))
    for (const m of page.DeleteMarkers ?? []) {
      if (m.IsLatest) markers.push({ Key: m.Key!, VersionId: m.VersionId! })
    }
    break   // 只看第一頁
    KeyMarker = page.NextKeyMarker
    VersionIdMarker = page.NextVersionIdMarker
  } while (true)

  // 刪掉 delete marker 本身（帶 VersionId），不是刪資料版本，也不是重新上傳
  for (const m of markers) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: m.Key, VersionId: m.VersionId }))
  return markers.map(m => m.Key).sort()
}
