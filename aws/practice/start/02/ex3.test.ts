// 練習 3：setupReporting 建出只給合作夥伴、只能讀報表的 role
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DeleteRoleCommand, DeleteRolePolicyCommand, DetachRolePolicyCommand, GetRoleCommand, GetRolePolicyCommand,
  IAMClient, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand,
} from '@aws-sdk/client-iam'
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts'
import { client, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { ROLE_NAME, setupReporting } from './setup-reporting.ts'

const dir = import.meta.dirname
const EXTERNAL_ID = 'cafe-reports-7f3a'
let sess: Session, partner: Session, iam: IAMClient, bucket: string, arn: string, setupError: unknown

const list = (v: unknown) => v === undefined ? [] : Array.isArray(v) ? v : [v]
// IAM 回傳的政策文件是 URL 編碼的 JSON
const decode = (doc: string | undefined) => JSON.parse(decodeURIComponent(doc ?? '{}'))

// 清掉上一次執行留下的 role（work/02 每次用同一個模擬帳號）
async function removeRole() {
  const names = await iam.send(new ListRolePoliciesCommand({ RoleName: ROLE_NAME })).then(r => r.PolicyNames ?? [], () => null)
  if (names === null) return
  for (const PolicyName of names) await iam.send(new DeleteRolePolicyCommand({ RoleName: ROLE_NAME, PolicyName }))
  const attached = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: ROLE_NAME }))
  for (const p of attached.AttachedPolicies ?? []) await iam.send(new DetachRolePolicyCommand({ RoleName: ROLE_NAME, PolicyArn: p.PolicyArn }))
  await iam.send(new DeleteRoleCommand({ RoleName: ROLE_NAME }))
}

before(async () => {
  await requireMoto()
  sess = await session(dir)
  partner = await session(dir + '-partner')
  iam = client(IAMClient, sess)
  bucket = `cafe-02-ex3-reports-${sess.account}`
  await removeRole()
  try { arn = await setupReporting(iam, { partnerAccount: partner.account, externalId: EXTERNAL_ID, bucket }) } catch (e) { setupError = e }
})

function ready() {
  if (setupError) throw new Error(`setupReporting 丟出錯誤：${(setupError as Error).message}`)
}

test('回傳的是這個帳號裡 cafe-02-ex3-reporting 的 ARN', async () => {
  ready()
  const { Role } = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }))
  assert.equal(arn, Role!.Arn, `要回傳 CreateRole 回應裡的 Role.Arn（${Role!.Arn}）`)
})

test('信任政策：只有合作夥伴的帳號能 assume，而且要帶 ExternalId', async () => {
  ready()
  const { Role } = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }))
  const trust = decode(Role!.AssumeRolePolicyDocument)
  const allows = list(trust.Statement).filter((s: any) => s.Effect === 'Allow')
  assert.equal(allows.length, 1, '信任政策只要一條 Allow')
  const s = allows[0]
  const principals = list(s.Principal?.AWS)
  assert.ok(s.Principal !== '*' && !principals.includes('*'), 'Principal 不能是 *：那等於任何 AWS 帳號都能來 assume，只靠 ExternalId 擋')
  assert.deepEqual(principals, [`arn:aws:iam::${partner.account}:root`], `Principal 要是 { AWS: 'arn:aws:iam::${partner.account}:root' }（合作夥伴的帳號），不是自己的帳號`)
  assert.deepEqual(list(s.Action), ['sts:AssumeRole'], 'Action 要是 sts:AssumeRole')
  assert.equal(s.Condition?.StringEquals?.['sts:ExternalId'], EXTERNAL_ID,
    '要有 Condition: { StringEquals: { "sts:ExternalId": externalId } }：沒有它，任何能說服合作夥伴替你操作的人都能借道進來（confused deputy）')
})

test('權限政策：只能 s3:GetObject 報表資料夾', async () => {
  ready()
  const { PolicyNames = [] } = await iam.send(new ListRolePoliciesCommand({ RoleName: ROLE_NAME }))
  assert.equal(PolicyNames.length, 1, `要用 PutRolePolicy 加剛好一份 inline policy，實際有 ${PolicyNames.length} 份`)
  const attached = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: ROLE_NAME }))
  assert.deepEqual((attached.AttachedPolicies ?? []).map(p => p.PolicyArn), [], '不要掛 AWS 受管政策（例如 AmazonS3ReadOnlyAccess）：它能讀帳號裡所有 bucket')
  const doc = decode((await iam.send(new GetRolePolicyCommand({ RoleName: ROLE_NAME, PolicyName: PolicyNames[0] }))).PolicyDocument)
  const statements = list(doc.Statement)
  assert.ok(statements.every((s: any) => s.Effect === 'Allow' && !s.NotAction && !s.NotResource), '這題只需要 Allow＋Action＋Resource')
  const actions = statements.flatMap((s: any) => list(s.Action))
  assert.deepEqual(actions, ['s3:GetObject'], `Action 只能是 s3:GetObject（不要 s3:* 或 s3:Get*），實際是 ${JSON.stringify(actions)}`)
  const resources = statements.flatMap((s: any) => list(s.Resource))
  assert.deepEqual(resources, [`arn:aws:s3:::${bucket}/reports/*`],
    `Resource 只能是 arn:aws:s3:::${bucket}/reports/*（報表資料夾底下的物件），實際是 ${JSON.stringify(resources)}`)
})

test('合作夥伴帶 ExternalId 能拿到這個 role 的臨時憑證', async () => {
  ready()
  const sts = client(STSClient, partner)
  const r = await sts.send(new AssumeRoleCommand({ RoleArn: arn, RoleSessionName: 'partner-report', ExternalId: EXTERNAL_ID }))
  assert.ok(r.Credentials?.SessionToken, 'AssumeRole 要拿到含 session token 的臨時憑證')
  assert.equal(r.AssumedRoleUser?.Arn, `arn:aws:sts::${sess.account}:assumed-role/${ROLE_NAME}/partner-report`, '拿到的身分要是咖啡店帳號裡的這個 role')
})
