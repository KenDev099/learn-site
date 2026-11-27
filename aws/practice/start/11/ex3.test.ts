// 練習 3：上線第一晚的四個事故修好了沒有，事後檢討寫完整了沒有。
// 模擬器不檢查 IAM 權限，所以這裡檢查的是 policy 文件與 task definition 本身
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { DescribeTaskDefinitionCommand } from '@aws-sdk/client-ecs'
import { DescribeTargetGroupsCommand } from '@aws-sdk/client-elastic-load-balancing-v2'
import { GetRolePolicyCommand } from '@aws-sdk/client-iam'
import { readText, requireMoto } from '../../helpers/aws.ts'
import { deploy } from './deploy.ts'
import { prepare } from './setup.ts'

const dir = import.meta.dirname
let env: string, name: string
let ctx: Awaited<ReturnType<typeof prepare>>
let out: Awaited<ReturnType<typeof deploy>>
type Statement = { Effect: string, Action: string | string[], Resource: string | string[] }

before(async () => {
  await requireMoto()
  ctx = await prepare(dir, 'ex3')
  env = ctx.opts.env
  name = `my-saas-${env}`
  out = await deploy(ctx.c, ctx.net, ctx.opts)
})

async function statements(role: string): Promise<Statement[]> {
  const r = await ctx.c.iam.send(new GetRolePolicyCommand({ RoleName: role, PolicyName: 'main' }))
  return [JSON.parse(decodeURIComponent(r.PolicyDocument!)).Statement].flat()
}
const list = (x: string | string[]) => [x].flat()
const allows = (st: Statement[], action: string) => st.filter(s => s.Effect === 'Allow' && list(s.Action).some(a => a === action || a === action.split(':')[0] + ':*' || a === '*'))
const taskDef = async (family: string) => (await ctx.c.ecs.send(new DescribeTaskDefinitionCommand({ taskDefinition: family }))).taskDefinition!

test('事故 a：讀 secret 的權限在 execution role，不在 task role', async () => {
  const exec = await statements(`${name}-execution`)
  const res = allows(exec, 'secretsmanager:GetSecretValue').flatMap(s => list(s.Resource))
  assert.ok(res.includes(out.appSecret) && res.includes(out.migrateSecret),
    'task 停在啟動階段（ResourceInitializationError: unable to pull secrets）：ECS 在容器啟動前用 execution role 讀 secret，GetSecretValue 要給 execution role，Resource 是 app 與 migrate 兩個 secret')
  const task = await statements(`${name}-task`)
  assert.equal(allows(task, 'secretsmanager:GetSecretValue').length, 0, 'task role 不需要讀 secret（程式拿到的是注入好的環境變數）：多給的權限要拿掉')
  const api = await taskDef(`${name}-api`)
  assert.notEqual(api.executionRoleArn, api.taskRoleArn, 'execution role 與 task role 要是兩個不同的 role')
})

test('事故 b：target group 的健康檢查打 /health/ready，port 跟容器一致', async () => {
  const tg = (await ctx.c.elb.send(new DescribeTargetGroupsCommand({ TargetGroupArns: [out.targetGroup] }))).TargetGroups![0]
  assert.equal(tg.HealthCheckPath, '/health/ready',
    '所有 task 都被判定不健康、部署被 circuit breaker 回滾：健康檢查的路徑沒有 /api/v1 前綴（作品的 HealthController 是 @Controller(\'health\')）')
  const api = await taskDef(`${name}-api`)
  assert.equal(api.containerDefinitions![0].portMappings?.[0]?.containerPort, tg.Port, 'target group 的 port 要等於容器的 containerPort（3100）')
})

test('事故 c：api 拿不到資料庫擁有者的連線字串；migration 是獨立的 task definition', async () => {
  const api = (await taskDef(`${name}-api`)).containerDefinitions![0]
  const names = (api.secrets ?? []).map(s => s.name).sort()
  assert.deepEqual(names, ['APP_DATABASE_URL', 'JWT_SECRET'],
    `api 注入了 ${names.join('、')}：api 只能拿 pf_app 的 APP_DATABASE_URL 與 JWT_SECRET。擁有者（DATABASE_URL）不受 RLS 限制，api 被攻破時整個資料庫都會外洩`)
  assert.ok(!(api.secrets ?? []).some(s => s.valueFrom!.startsWith(out.migrateSecret)), 'api 不能引用 migrate 的 secret')
  assert.ok(!(api.environment ?? []).some(e => e.name === 'DATABASE_URL'), 'environment 裡也不能有 DATABASE_URL')
  const mig = (await taskDef(`${name}-migrate`)).containerDefinitions![0]
  assert.deepEqual(mig.command, ['npx', 'prisma', 'migrate', 'deploy'], 'migration 用獨立的 task definition 執行 prisma migrate deploy')
  assert.ok(mig.secrets?.some(s => s.name === 'DATABASE_URL' && s.valueFrom!.startsWith(out.migrateSecret)), 'migrate 的 DATABASE_URL 來自 migrate secret')
})

test('事故 d：task role 能用 bucket 的 KMS 金鑰，而且只限這把', async () => {
  const task = await statements(`${name}-task`)
  for (const action of ['kms:Decrypt', 'kms:GenerateDataKey']) {
    const st = allows(task, action)
    assert.ok(st.length > 0, `檔案下載與上傳 AccessDenied：bucket 用 SSE-KMS，task role 要有 ${action}（讀要 Decrypt、寫要 GenerateDataKey）`)
    assert.ok(st.every(s => list(s.Resource).every(r => r === out.keyArn)), `${action} 的 Resource 只能是這把金鑰的 ARN，不要寫 *`)
    assert.ok(st.every(s => list(s.Action).every(a => a !== 'kms:*' && a !== '*')), `只給 kms:Decrypt 與 kms:GenerateDataKey，不要給 kms:*`)
  }
  const s3 = allows(task, 's3:GetObject')
  assert.deepEqual(s3.flatMap(s => list(s.Resource)), [`arn:aws:s3:::${out.bucket}/tenants/*`], 'S3 的權限仍然只限 tenants/ 底下')
})

test('postmortem.md：影響、時間線、根本原因、修正、改善項目都寫了', () => {
  const md = readText(dir, 'postmortem.md')
  assert.ok(!md.includes('待填'), '還有「待填」沒寫完')
  const section = (title: string) => {
    const m = md.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))
    assert.ok(m, `缺少「## ${title}」這一節`)
    return m[1].trim()
  }
  assert.ok(section('影響').length >= 20, '「影響」要寫出影響了誰、多久')
  const times = section('時間線').split('\n').filter(l => /\d{1,2}:\d{2}/.test(l))
  assert.ok(times.length >= 4, `「時間線」至少 4 行有時間（HH:MM），目前 ${times.length} 行`)
  const cause = section('根本原因')
  for (const [k, re] of [['execution role', /execution role/i], ['健康檢查路徑', /health|健康檢查/i], ['擁有者的連線字串', /DATABASE_URL|擁有者/], ['KMS 權限', /kms/i]] as const) {
    assert.match(cause, re, `「根本原因」要寫到「${k}」這個事故`)
  }
  assert.ok(section('修正').length >= 20, '「修正」要寫出改了什麼')
  const items = section('改善項目').split('\n').filter(l => /^\s*[-*]\s+/.test(l))
  assert.ok(items.length >= 3, `「改善項目」至少 3 項（用 - 開頭的清單），目前 ${items.length} 項`)
  for (const item of items) {
    assert.match(item, /負責人/, `改善項目要有負責人：${item.trim()}`)
    assert.match(item, /\d{4}-\d{2}-\d{2}/, `改善項目要有期限（YYYY-MM-DD）：${item.trim()}`)
  }
})
