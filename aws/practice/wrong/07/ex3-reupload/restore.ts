// 錯誤寫法：把上一個版本複製回來（會多出一個新版本），而不是刪掉 delete marker
import { CopyObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3'

export async function restoreDeleted(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const deleted = new Set<string>()
  const versions: { Key: string, VersionId: string }[] = []
  let KeyMarker: string | undefined, VersionIdMarker: string | undefined
  for (;;) {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker, VersionIdMarker }))
    for (const m of page.DeleteMarkers ?? []) if (m.IsLatest) deleted.add(m.Key!)
    for (const v of page.Versions ?? []) versions.push({ Key: v.Key!, VersionId: v.VersionId! })
    if (!page.IsTruncated) break
    KeyMarker = page.NextKeyMarker; VersionIdMarker = page.NextVersionIdMarker
  }
  for (const key of deleted) {
    const prev = versions.find(v => v.Key === key)!   // 同一個 key 裡最新的資料版本
    await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: `${bucket}/${key}?versionId=${prev.VersionId}` }))
  }
  return [...deleted].sort()
}
