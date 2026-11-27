// 練習 3：讓合作夥伴的帳號讀咖啡店 bucket 裡的報表，而且只能讀報表
import { IAMClient } from '@aws-sdk/client-iam'

export const ROLE_NAME = 'cafe-02-ex3-reporting'

type Options = { partnerAccount: string, externalId: string, bucket: string }

// 建立 role 並回傳它的 ARN
export async function setupReporting(iam: IAMClient, { partnerAccount, externalId, bucket }: Options): Promise<string> {
  // 1. 信任政策：只允許 partnerAccount（arn:aws:iam::<帳號>:root）sts:AssumeRole，而且 sts:ExternalId 要等於 externalId
  // 2. CreateRoleCommand 建立 ROLE_NAME（政策文件用 JSON.stringify 傳入）
  // 3. PutRolePolicyCommand 加一份 inline policy：只能 s3:GetObject 這個 bucket 的 reports/ 底下
  // 4. 回傳 role 的 ARN
  throw new Error('還沒寫')
}
