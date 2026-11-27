// 練習 4：lockdown 建出三層安全群組與 S3 gateway endpoint
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CreateRouteTableCommand, CreateVpcCommand, DescribeRouteTablesCommand, DescribeSecurityGroupsCommand,
  DescribeVpcEndpointsCommand, EC2Client, type IpPermission,
} from '@aws-sdk/client-ec2'
import { client, requireMoto, session } from '../../helpers/aws.ts'
import { lockdown } from './lockdown.ts'

const dir = import.meta.dirname
let ec2: EC2Client, vpcId: string, publicRt: string, privateRts: string[], bucket: string
let result: Awaited<ReturnType<typeof lockdown>>, setupError: unknown

before(async () => {
  await requireMoto()
  const sess = await session(dir)
  ec2 = client(EC2Client, sess)
  bucket = `cafe-03-ex4-uploads-${sess.account}`
  // 每次執行都建一個新的 VPC：安全群組名稱只在同一個 VPC 裡不能重複
  vpcId = (await ec2.send(new CreateVpcCommand({ CidrBlock: '10.20.0.0/16' }))).Vpc!.VpcId!
  const rt = async () => (await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }))).RouteTable!.RouteTableId!
  publicRt = await rt()
  privateRts = [await rt(), await rt()]   // 兩個 AZ 的私有子網路各一個 route table
  try { result = await lockdown(ec2, { vpcId, privateRouteTableIds: privateRts, bucket }) } catch (e) { setupError = e }
})

function ready() {
  if (setupError) throw new Error(`lockdown 丟出錯誤：${(setupError as Error).message}`)
}
async function ingress(groupId: string): Promise<IpPermission[]> {
  const r = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [groupId] }))
  const g = r.SecurityGroups![0]
  assert.equal(g.VpcId, vpcId, `安全群組 ${g.GroupName} 要建在傳入的 VPC 裡（VpcId）`)
  return g.IpPermissions ?? []
}
function only(perms: IpPermission[], port: number, what: string) {
  assert.equal(perms.length, 1, `${what}只能有一條進入規則，實際有 ${perms.length} 條`)
  const p = perms[0]
  assert.deepEqual([p.IpProtocol, p.FromPort, p.ToPort], ['tcp', port, port], `${what}的規則要是 tcp ${port}（FromPort、ToPort 都是 ${port}）`)
  return p
}

test('alb：tcp 443 對網際網路開放', async () => {
  ready()
  const p = only(await ingress(result.albSg), 443, 'alb 安全群組')
  assert.deepEqual((p.IpRanges ?? []).map(r => r.CidrIp), ['0.0.0.0/0'], 'alb 的來源是 0.0.0.0/0：顧客從任何地方連進來')
})

test('app：tcp 3000 只接受 alb 的安全群組', async () => {
  ready()
  const p = only(await ingress(result.appSg), 3000, 'app 安全群組')
  assert.deepEqual(p.IpRanges ?? [], [], 'app 的來源不能寫 CIDR：用 UserIdGroupPairs 參照 alb 的安全群組')
  assert.deepEqual((p.UserIdGroupPairs ?? []).map(u => u.GroupId), [result.albSg], 'app 的來源要是 alb 的安全群組')
})

test('db：tcp 5432 只接受 app 的安全群組，不是整個 VPC', async () => {
  ready()
  const p = only(await ingress(result.dbSg), 5432, 'db 安全群組')
  assert.deepEqual(p.IpRanges ?? [], [], 'db 的來源不能寫 CIDR（例如 VPC 的 10.20.0.0/16）：VPC 裡任何一台被入侵的機器都能連資料庫。用 app 的安全群組當來源')
  assert.deepEqual((p.UserIdGroupPairs ?? []).map(u => u.GroupId), [result.appSg], 'db 的來源要是 app 的安全群組')
})

test('S3 gateway endpoint 掛在所有私有 route table，公有的不用', async () => {
  ready()
  const r = await ec2.send(new DescribeVpcEndpointsCommand({ VpcEndpointIds: [result.endpointId] }))
  const ep = r.VpcEndpoints![0]
  assert.equal(ep.VpcEndpointType, 'Gateway', 'S3 用 Gateway 類型的 endpoint：不收費，靠 route table 導流')
  assert.equal(ep.ServiceName, 'com.amazonaws.ap-northeast-1.s3', '服務名稱是 com.amazonaws.<region>.s3')
  assert.equal(ep.VpcId, vpcId, 'endpoint 要建在這個 VPC')
  assert.deepEqual([...(ep.RouteTableIds ?? [])].sort(), [...privateRts].sort(),
    'RouteTableIds 要包含所有私有 route table：沒掛到的子網路，S3 流量照樣走 NAT')
  const tables = await ec2.send(new DescribeRouteTablesCommand({ RouteTableIds: privateRts }))
  for (const t of tables.RouteTables!) {
    assert.ok(t.Routes!.some(x => x.GatewayId === result.endpointId && x.DestinationPrefixListId),
      `route table ${t.RouteTableId} 要有一條目的地是 S3 prefix list、目標是 endpoint 的路由`)
  }
})

// endpoint policy 的簡化評估：只看 Allow 的 Action 與 Resource（* 萬用字元）
const list = (v: unknown): string[] => v === undefined ? [] : Array.isArray(v) ? v : [v as string]
const like = (p: string, v: string) => new RegExp('^' + p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(v)
function allows(policy: any, action: string, resource: string) {
  return list(policy.Statement).some((s: any) => s.Effect === 'Allow'
    && list(s.Action).some(a => like(a, action)) && list(s.Resource).some(r => like(r, resource)))
}

test('endpoint policy 只允許咖啡店的 bucket', async () => {
  ready()
  const r = await ec2.send(new DescribeVpcEndpointsCommand({ VpcEndpointIds: [result.endpointId] }))
  const raw = r.VpcEndpoints![0].PolicyDocument
  assert.ok(raw, '要傳 PolicyDocument：沒傳時預設是允許所有 bucket')
  const policy = JSON.parse(raw)
  assert.ok(allows(policy, 's3:GetObject', `arn:aws:s3:::${bucket}/menu/latte.jpg`), `要允許讀 ${bucket} 裡的物件（Resource 寫 arn:aws:s3:::${bucket}/*）`)
  assert.ok(allows(policy, 's3:PutObject', `arn:aws:s3:::${bucket}/receipts/1.pdf`), `要允許寫入 ${bucket} 的物件`)
  assert.ok(allows(policy, 's3:ListBucket', `arn:aws:s3:::${bucket}`), `ListBucket 作用在 bucket 本身：Resource 也要有 arn:aws:s3:::${bucket}`)
  assert.ok(!allows(policy, 's3:GetObject', 'arn:aws:s3:::someone-elses-bucket/dump.csv'),
    'endpoint policy 不能允許別的 bucket：Resource 用 * 時，被入侵的機器可以把資料寫到攻擊者的 bucket')
  assert.ok(!allows(policy, 's3:PutObject', 'arn:aws:s3:::someone-elses-bucket/dump.csv'), '別的 bucket 也不能寫入')
})
