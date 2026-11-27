// 練習 3：restoreToPoint 檢查可還原範圍、還原成新名稱、沿用子網路群組、安全群組與參數群組
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { CreateSecurityGroupCommand, CreateSubnetCommand, CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2'
import {
  CreateDBInstanceCommand, CreateDBParameterGroupCommand, CreateDBSubnetGroupCommand, DeleteDBInstanceCommand,
  DescribeDBInstancesCommand, RDSClient,
} from '@aws-sdk/client-rds'
import { client, REGION, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { restoreToPoint } from './restore-plan.ts'

const dir = import.meta.dirname
const run = Date.now().toString(36)
const SRC = `cafe-08-db-${run}`
const NOBACKUP = `cafe-08-nobackup-${run}`
let sess: Session, rds: RDSClient, sg: string, created: Date
const sent: { cmd: string, input: any }[] = []
const made: string[] = []

before(async () => {
  await requireMoto()
  sess = await session(dir)
  rds = client(RDSClient, sess)
  rds.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    sent.push({ cmd: ctx.commandName, input: structuredClone(args.input) })
    return next(args)
  }, { step: 'initialize', name: 'recordRds' })
  const ec2 = client(EC2Client, sess)
  const vpc = (await ec2.send(new CreateVpcCommand({ CidrBlock: '10.8.0.0/16' }))).Vpc!.VpcId!
  const a = (await ec2.send(new CreateSubnetCommand({ VpcId: vpc, CidrBlock: '10.8.21.0/24', AvailabilityZone: `${REGION}a` }))).Subnet!.SubnetId!
  const c = (await ec2.send(new CreateSubnetCommand({ VpcId: vpc, CidrBlock: '10.8.22.0/24', AvailabilityZone: `${REGION}c` }))).Subnet!.SubnetId!
  sg = (await ec2.send(new CreateSecurityGroupCommand({ VpcId: vpc, GroupName: `cafe-08-db-${run}`, Description: 'db' }))).GroupId!
  await rds.send(new CreateDBSubnetGroupCommand({ DBSubnetGroupName: `cafe-08-private-${run}`, DBSubnetGroupDescription: 'private', SubnetIds: [a, c] }))
  await rds.send(new CreateDBParameterGroupCommand({ DBParameterGroupName: `cafe-08-pg17-${run}`, DBParameterGroupFamily: 'postgres17', Description: 'cafe' }))
  const db = await rds.send(new CreateDBInstanceCommand({
    DBInstanceIdentifier: SRC, Engine: 'postgres', EngineVersion: '17.4', DBInstanceClass: 'db.t4g.small', AllocatedStorage: 20,
    MasterUsername: 'cafe', MasterUserPassword: 'not-a-real-password', BackupRetentionPeriod: 7, MultiAZ: true,
    DBSubnetGroupName: `cafe-08-private-${run}`, VpcSecurityGroupIds: [sg], DBParameterGroupName: `cafe-08-pg17-${run}`, PubliclyAccessible: false,
  }))
  created = db.DBInstance!.InstanceCreateTime!
  made.push(SRC)
  await rds.send(new CreateDBInstanceCommand({
    DBInstanceIdentifier: NOBACKUP, Engine: 'postgres', DBInstanceClass: 'db.t4g.micro', AllocatedStorage: 20,
    MasterUsername: 'cafe', MasterUserPassword: 'not-a-real-password', BackupRetentionPeriod: 0,
  }))
  made.push(NOBACKUP)
  await sleep(1500)   // 讓「建立時間」和「現在」之間有一段可以還原的範圍
})
after(async () => {
  for (const id of made) await rds?.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: id, SkipFinalSnapshot: true })).catch(() => {})
})

test('範圍外的時間：丟 RangeError，而且不能送出還原請求', async () => {
  const n = sent.length
  await assert.rejects(restoreToPoint(rds, SRC, new Date(Date.now() + 10 * 60_000)), RangeError,
    '比 LatestRestorableTime 還晚的時間要丟 RangeError：備份還沒涵蓋到那一刻')
  await assert.rejects(restoreToPoint(rds, SRC, new Date(created.getTime() - 60_000)), RangeError,
    '比執行個體建立時間還早的時間要丟 RangeError（保留天數是 7 天，但它才剛建立）')
  await assert.rejects(restoreToPoint(rds, NOBACKUP, new Date()), '沒有開自動備份（BackupRetentionPeriod 0）的執行個體要丟錯')
  assert.equal(sent.slice(n).filter(s => s.cmd === 'RestoreDBInstanceToPointInTimeCommand').length, 0,
    '範圍檢查要在送出 RestoreDBInstanceToPointInTime 之前：模擬器不檢查範圍，真的 AWS 會等一段時間才失敗')
})

test('範圍內：還原成新的執行個體，名稱用 UTC 時間', async () => {
  const time = new Date(created.getTime() + 500)
  const r = await restoreToPoint(rds, SRC, time)
  const stamp = time.toISOString().slice(0, 16).replace(/[-:T]/g, '')
  assert.equal(r.id, `${SRC}-pitr-${stamp}`, `新名稱要是 ${SRC}-pitr-${stamp}（UTC 的年月日時分）：還原一定是新的執行個體，原本那台不動`)
  made.push(r.id)
  const d = (await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: r.id }))).DBInstances![0]
  assert.equal(r.endpoint, d.Endpoint?.Address, '回傳的 endpoint 是新執行個體的 Endpoint.Address：應用程式要改連這個新位址')
  const input = sent.find(s => s.cmd === 'RestoreDBInstanceToPointInTimeCommand')!.input
  assert.equal(input.SourceDBInstanceIdentifier, SRC)
  assert.equal(new Date(input.RestoreTime).getTime(), time.getTime(), 'RestoreTime 要用傳進來的 time，不能用 UseLatestRestorableTime（那會把誤刪也還原回來）')
  assert.ok(!input.UseLatestRestorableTime, '不能用 UseLatestRestorableTime')
})

test('沿用來源的網路與參數設定，不公開', async () => {
  const input = sent.find(s => s.cmd === 'RestoreDBInstanceToPointInTimeCommand')!.input
  assert.equal(input.DBInstanceClass, 'db.t4g.small', 'DBInstanceClass 沿用來源的機型')
  assert.equal(input.DBSubnetGroupName, `cafe-08-private-${run}`, 'DBSubnetGroupName 沿用來源的（私有子網路）')
  assert.deepEqual(input.VpcSecurityGroupIds, [sg], 'VpcSecurityGroupIds 要沿用來源的安全群組：不指定就會套用 VPC 的預設安全群組，應用程式連不上')
  assert.equal(input.DBParameterGroupName, `cafe-08-pg17-${run}`, 'DBParameterGroupName 要沿用：不指定會套用預設參數群組，調過的設定全部不見')
  assert.equal(input.PubliclyAccessible, false, 'PubliclyAccessible 要明確設 false')
})
