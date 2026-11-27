// 練習 3：讓合作夥伴的帳號讀咖啡店 bucket 裡的報表，而且只能讀報表
import { CreateRoleCommand, IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam'

export const ROLE_NAME = 'cafe-02-ex3-reporting'

type Options = { partnerAccount: string, externalId: string, bucket: string }

// 建立 role 並回傳它的 ARN
export async function setupReporting(iam: IAMClient, { partnerAccount, externalId, bucket }: Options): Promise<string> {
  const trust = {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { AWS: `arn:aws:iam::${partnerAccount}:root` },
      Action: 'sts:AssumeRole',
      Condition: { StringEquals: { 'sts:ExternalId': externalId } },
    }],
  }
  const { Role } = await iam.send(new CreateRoleCommand({ RoleName: ROLE_NAME, AssumeRolePolicyDocument: JSON.stringify(trust) }))
  const permissions = {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Action: 's3:*', Resource: `arn:aws:s3:::${bucket}/reports/*` }],
  }
  await iam.send(new PutRolePolicyCommand({ RoleName: ROLE_NAME, PolicyName: 'read-reports', PolicyDocument: JSON.stringify(permissions) }))
  return Role!.Arn!
}
