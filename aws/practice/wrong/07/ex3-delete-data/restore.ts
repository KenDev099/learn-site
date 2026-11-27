// 錯誤寫法：刪掉的是最新的「資料版本」，不是 delete marker
import { DeleteObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3'

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
    const v = versions.find(x => x.Key === key)!
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: v.VersionId }))
  }
  return [...deleted].sort()
}
