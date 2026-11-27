// 練習 4：替目前的帳號與 region 建立菜單圖片的 bucket，重複執行也安全
import { CreateBucketCommand, S3Client, type BucketLocationConstraint } from '@aws-sdk/client-s3'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'

export async function ensureMenuBucket(s3: S3Client, sts: STSClient): Promise<{ name: string, created: boolean }> {
  const { Account } = await sts.send(new GetCallerIdentityCommand({}))
  const region = await s3.config.region()
  const name = `cafe-menu-${Account}-${region}`
  try {
    await s3.send(new CreateBucketCommand({
      Bucket: name,
      // us-east-1 是預設位置，不能寫；其他 region 一定要寫
      
    }))
    return { name, created: true }
  } catch (e) {
    if ((e as Error).name === 'BucketAlreadyOwnedByYou') return { name, created: false }
    throw e
  }
}
