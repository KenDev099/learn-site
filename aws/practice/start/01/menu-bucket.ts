// 練習 4：替目前的帳號與 region 建立菜單圖片的 bucket，重複執行也安全
import { S3Client } from '@aws-sdk/client-s3'
import { STSClient } from '@aws-sdk/client-sts'

export async function ensureMenuBucket(s3: S3Client, sts: STSClient): Promise<{ name: string, created: boolean }> {
  // 1. 用 sts 查帳號 ID、用 await s3.config.region() 取得 region
  // 2. 名稱：cafe-menu-<帳號>-<region>
  // 3. CreateBucketCommand：us-east-1 以外要帶 CreateBucketConfiguration.LocationConstraint
  // 4. 已經是自己的（BucketAlreadyOwnedByYou）回傳 created: false；其他錯誤照樣丟出
  throw new Error('還沒寫')
}
