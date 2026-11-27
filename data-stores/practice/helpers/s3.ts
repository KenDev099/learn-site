// S3 相容儲存 Garage（第 12、15 課）：每個 bucket 用 t<NN>- 開頭，每個測試檔開始前清空並重建
// 用法：const { s3, bucket } = useS3(12, 'receipts')   // bucket 是 't12-receipts'
// 連 Garage 要 forcePathStyle（網址寫成 http://host/bucket/key）、region 'garage'；金鑰是 compose.yaml 裡固定的開發用值
import { after, before } from 'node:test'
import {
  AbortMultipartUploadCommand, CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand,
  ListMultipartUploadsCommand, ListObjectsV2Command, S3Client,
} from '@aws-sdk/client-s3'
import { notRunning } from './service.ts'

export const S3_CONFIG = {
  endpoint: 'http://127.0.0.1:16490',
  region: 'garage',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'GK6c6561726e2d64732d6b65792d303031',
    secretAccessKey: '6c6561726e2d646174612d73746f7265732d6465762d7365637265742d303031',
  },
}

export function useS3(lesson: number, name: string) {
  const s3 = new S3Client(S3_CONFIG)
  const bucket = `t${String(lesson).padStart(2, '0')}-${name}`
  before(async () => {
    try {
      await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))
      await emptyAndDelete(s3, bucket)
    } catch (e) {
      if ((e as Error).name !== 'NoSuchBucket') throw notRunning('S3 相容儲存 Garage（127.0.0.1:16490）', 's3', e)
    }
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  })
  after(() => s3.destroy())
  return { s3, bucket }
}

async function emptyAndDelete(s3: S3Client, bucket: string) {
  let token: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    const keys = (page.Contents ?? []).map(o => ({ Key: o.Key! }))
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }))
    token = page.NextContinuationToken
  } while (token)
  const uploads = await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket }))
  for (const u of uploads.Uploads ?? []) await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }))
  await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
}
