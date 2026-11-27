// 練習 2：deploy 跑兩次都成功、第二次不多建也不改機密；RDS、log、告警、成本分攤標籤設對
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch'
import { DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { GetSecretValueCommand, ListSecretVersionIdsCommand } from '@aws-sdk/client-secrets-manager'
import { requireMoto } from '../../helpers/aws.ts'
import { deploy } from './deploy.ts'
import { prepare, type Sent } from './setup.ts'

const dir = import.meta.dirname
let env: string, name: string
let ctx: Awaited<ReturnType<typeof prepare>>
let first: Awaited<ReturnType<typeof deploy>>, second: Awaited<ReturnType<typeof deploy>>
let firstRun: Sent[] = []
const count = (sent: Sent[], cmd: string) => sent.filter(s => s.cmd === cmd).length

before(async () => {
  await requireMoto()
  ctx = await prepare(dir, 'ex2')
  env = ctx.opts.env
  name = `my-saas-${env}`
  first = await deploy(ctx.c, ctx.net, ctx.opts)
  firstRun = [...ctx.sent]
  second = await deploy(ctx.c, ctx.net, ctx.opts)
})

test('重複執行：第二次部署找回同樣的資源，不多建', () => {
  for (const k of ['repoUri', 'bucket', 'keyArn', 'ownerSecret', 'migrateSecret', 'appSecret', 'targetGroup', 'loadBalancer', 'dbHost', 'logGroup'] as const) {
    assert.equal(second[k], first[k], `第二次部署的 ${k} 跟第一次不同：ensureX 要先查，存在就用原本的`)
  }
  assert.equal(count(ctx.sent, 'CreateDBInstanceCommand'), 1, 'CreateDBInstance 只能送一次：先用 DescribeDBInstances 查，找不到（DBInstanceNotFoundFault）才建')
  assert.equal(count(ctx.sent, 'CreateSecretCommand'), 3, '三個 secret 各建一次：先用 DescribeSecret 查，找不到（ResourceNotFoundException）才建')
  assert.equal(count(ctx.sent, 'CreateLogGroupCommand'), 1, 'log group 只建一次')
})

test('第二次部署不會改掉已經存在的機密', async () => {
  assert.equal(count(ctx.sent, 'PutSecretValueCommand'), 0, '不要對已經存在的 secret 寫入新值：資料庫的密碼已經是舊值，覆寫就連不上了')
  assert.equal(count(ctx.sent, 'GetRandomPasswordCommand'), count(firstRun, 'GetRandomPasswordCommand'),
    '第二次部署又產生了新密碼：secret 已經存在時，不要呼叫 makeValue')
  for (const id of [first.ownerSecret, first.migrateSecret, first.appSecret]) {
    const v = await ctx.c.sm.send(new ListSecretVersionIdsCommand({ SecretId: id }))
    assert.equal(v.Versions?.length, 1, `${id} 有 ${v.Versions?.length} 個版本：重複部署不能產生新版本`)
  }
})

test('log group 保留 30 天', async () => {
  const g = (await ctx.c.logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: `/ecs/${name}` }))).logGroups?.find(x => x.logGroupName === `/ecs/${name}`)
  assert.ok(g, `要建立 log group /ecs/${name}`)
  assert.equal(g.retentionInDays, 30, 'log group 的保留天數要設 30（PutRetentionPolicyCommand）：沒設就是永久保存，費用一直累積')
})

test('RDS：Multi-AZ、保留 7 天備份、加密、不公開、防誤刪，放在私有子網路與 db-sg', async () => {
  const create = ctx.sent.find(s => s.cmd === 'CreateDBInstanceCommand')?.input
  assert.ok(create, '要用 CreateDBInstanceCommand 建立資料庫')
  assert.equal(create.DBInstanceIdentifier, name)
  assert.equal(create.Engine, 'postgres', 'Engine 是 postgres（作品用 PostgreSQL 的 RLS）')
  assert.equal(create.DBName, 'my_saas')
  assert.equal(create.MultiAZ, true, 'MultiAZ: true：需求是一個 AZ 故障時 15 分鐘內恢復')
  assert.ok(create.BackupRetentionPeriod >= 7, 'BackupRetentionPeriod 至少 7：自動備份是 PITR 的前提，需求是能還原到 7 天內任一時間點')
  assert.equal(create.StorageEncrypted, true, 'StorageEncrypted: true')
  assert.equal(create.PubliclyAccessible, false, 'PubliclyAccessible: false：資料庫不能有公開 IP')
  assert.equal(create.DeletionProtection, true, 'DeletionProtection: true：防止誤刪')
  assert.deepEqual(create.VpcSecurityGroupIds, [ctx.net.dbSg], 'VpcSecurityGroupIds 只有 db-sg')
  const group = ctx.sent.find(s => s.cmd === 'CreateDBSubnetGroupCommand')?.input
  assert.equal(create.DBSubnetGroupName, group?.DBSubnetGroupName, '要先建 DB subnet group，再在 CreateDBInstance 指定它')
  assert.deepEqual([...(group?.SubnetIds ?? [])].sort(), [...ctx.net.privateSubnets].sort(), 'DB subnet group 用私有子網路')
  const owner = JSON.parse((await ctx.c.sm.send(new GetSecretValueCommand({ SecretId: first.ownerSecret }))).SecretString!)
  assert.equal(create.MasterUsername, owner.username, 'MasterUsername 用 owner secret 裡的帳號')
  assert.equal(create.MasterUserPassword, owner.password, 'MasterUserPassword 用 owner secret 裡的密碼')
  const url = new URL(JSON.parse((await ctx.c.sm.send(new GetSecretValueCommand({ SecretId: first.migrateSecret }))).SecretString!).DATABASE_URL)
  assert.equal(url.hostname, first.dbHost, 'ensureDatabase 要回傳 RDS 的 Endpoint（Address、Port）')
  assert.ok(url.hostname.length > 0 && url.port === '5432', 'ensureDatabase 回傳的 port 是 Endpoint 的 Port')
})

test('三個告警：維度用 ARN 的最後一段，觸發與恢復都通知 topic', async () => {
  const alarms = (await ctx.c.cw.send(new DescribeAlarmsCommand({ AlarmNamePrefix: name }))).MetricAlarms ?? []
  const get = (suffix: string) => {
    const a = alarms.find(x => x.AlarmName === `${name}-${suffix}`)
    assert.ok(a, `找不到告警 ${name}-${suffix}`)
    assert.deepEqual(a.AlarmActions, [first.topic], `${suffix}：AlarmActions 是 [topic ARN]`)
    assert.deepEqual(a.OKActions, [first.topic], `${suffix}：OKActions 也是 [topic ARN]，恢復時才會通知`)
    return a
  }
  const lb = first.loadBalancer.split(':loadbalancer/')[1]          // app/<名稱>/<id>
  const tg = first.targetGroup.split(':').slice(5).join(':')      // targetgroup/<名稱>/<id>
  const dims = (a: any) => Object.fromEntries((a.Dimensions ?? []).map((d: any) => [d.Name, d.Value]))
  const five = get('alb-5xx')
  assert.equal(five.Namespace, 'AWS/ApplicationELB')
  assert.equal(five.MetricName, 'HTTPCode_Target_5XX_Count')
  assert.deepEqual(dims(five), { LoadBalancer: lb, TargetGroup: tg },
    `維度的值要是 ARN 的最後一段：LoadBalancer 是 ${lb}、TargetGroup 是 ${tg}。寫整個 ARN 不會報錯，但告警永遠收不到資料`)
  assert.equal(five.Statistic, 'Sum')
  assert.equal(five.Period, 60)
  assert.equal(five.EvaluationPeriods, 5)
  assert.equal(five.DatapointsToAlarm, 3)
  assert.equal(five.Threshold, 10)
  assert.equal(five.ComparisonOperator, 'GreaterThanThreshold')
  assert.equal(five.TreatMissingData, 'notBreaching', '半夜沒流量時 ALB 不送資料，TreatMissingData 要是 notBreaching，不然會一直誤報或卡在 INSUFFICIENT_DATA')
  const un = get('unhealthy-hosts')
  assert.equal(un.MetricName, 'UnHealthyHostCount')
  assert.deepEqual(dims(un), { LoadBalancer: lb, TargetGroup: tg }, 'UnHealthyHostCount 一定要同時有 LoadBalancer 與 TargetGroup 兩個維度')
  assert.equal(un.Statistic, 'Minimum', 'UnHealthyHostCount 用 Minimum：每個 ALB 節點都認為不健康才算（ALB 文件的建議）')
  assert.equal(un.Threshold, 0)
  assert.equal(un.ComparisonOperator, 'GreaterThanThreshold')
  assert.equal(un.EvaluationPeriods, 2)
  const disk = get('db-free-storage')
  assert.equal(disk.Namespace, 'AWS/RDS')
  assert.equal(disk.MetricName, 'FreeStorageSpace')
  assert.deepEqual(dims(disk), { DBInstanceIdentifier: name })
  assert.equal(disk.ComparisonOperator, 'LessThanThreshold')
  assert.equal(disk.Threshold, 2 * 1024 ** 3, 'FreeStorageSpace 的單位是 bytes：2 GiB 是 2 * 1024 ** 3')
})

test('每個建立資源的請求都帶成本分攤標籤 Project 與 Environment', () => {
  const tagsOf = (s: Sent): Record<string, string> | undefined => {
    const i = s.input
    const list = i.Tags ?? i.tags ?? i.Tagging?.TagSet
    if (!list) return undefined
    if (!Array.isArray(list)) return list                                           // CreateLogGroup 的 tags 是物件
    return Object.fromEntries(list.map((t: any) => [t.Key ?? t.key ?? t.TagKey, t.Value ?? t.value ?? t.TagValue]))
  }
  const creators = ['CreateRepositoryCommand', 'CreateLogGroupCommand', 'CreateKeyCommand', 'PutBucketTaggingCommand', 'CreateSecretCommand', 'CreateDBSubnetGroupCommand',
    'CreateDBInstanceCommand', 'CreateRoleCommand', 'CreateTargetGroupCommand', 'CreateLoadBalancerCommand', 'RegisterTaskDefinitionCommand', 'CreateClusterCommand',
    'CreateServiceCommand', 'CreateTopicCommand', 'PutMetricAlarmCommand']
  for (const s of ctx.sent.filter(x => creators.includes(x.cmd))) {
    const t = tagsOf(s)
    assert.equal(t?.Project, 'my-saas', `${s.cmd} 沒有帶標籤 Project=my-saas`)
    assert.equal(t?.Environment, env, `${s.cmd} 沒有帶標籤 Environment=${env}`)
  }
})
