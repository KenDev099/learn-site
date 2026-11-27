// 練習 2：放 Vue 網站的私有 bucket：擋公開、開版本控制、SSE-KMS＋bucket key、拒絕非 HTTPS
import { S3Client } from '@aws-sdk/client-s3'

export async function secureSiteBucket(s3: S3Client, bucket: string, kmsKeyArn: string): Promise<void> {
  // 1. CreateBucket（us-east-1 以外要帶 LocationConstraint，region 用 await s3.config.region()）
  // 2. Block Public Access 四個設定全開
  // 3. 版本控制 Enabled
  // 4. 預設加密：aws:kms＋kmsKeyArn，開 bucket key
  // 5. bucket policy：拒絕（Deny）所有不是 HTTPS 的請求，bucket 本身和裡面的物件都要涵蓋
  throw new Error('還沒寫')
}
