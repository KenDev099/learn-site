// 另建一份通用的唯讀受管政策掛上去：能讀帳號裡所有 bucket
import { AttachRolePolicyCommand, CreatePolicyCommand, CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam'

export const ROLE_NAME = 'cafe-02-ex3-reporting'

type Options = { partnerAccount: string, externalId: string, bucket: string }

export async function setupReporting(iam: IAMClient, { partnerAccount, externalId }: Options): Promise<string> {
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
  const doc = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['s3:GetObject', 's3:ListBucket'], Resource: '*' }] }
  const { Policy } = await iam.send(new CreatePolicyCommand({ PolicyName: `cafe-02-read-all-${Date.now()}`, PolicyDocument: JSON.stringify(doc) }))
  await iam.send(new AttachRolePolicyCommand({ RoleName: ROLE_NAME, PolicyArn: Policy!.Arn }))
  return Role!.Arn!
}
