// 練習 3：deployApi 建出 ECR、task definition、cluster、service，第二次執行是換版部署
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { DeleteRepositoryCommand, DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr'
import { DeleteClusterCommand, DeleteServiceCommand, DescribeServicesCommand, DescribeTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs'
import { CreateSecurityGroupCommand, CreateSubnetCommand, CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2'
import { CreateSecretCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { client, REGION, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { deployApi, type DeployOpts } from './deploy-api.ts'

const dir = import.meta.dirname
// 每次執行用不同的名稱：重複跑測試也是「第一次部署」
const NAME = `cafe-05-ex3-api-${Date.now().toString(36)}`
const D1 = 'sha256:' + '1'.repeat(64)
const D2 = 'sha256:' + '2'.repeat(64)
let sess: Session, ecr: ECRClient, ecs: ECSClient, opts: DeployOpts
// 記下送給 ECS 的每個請求：模擬器不會保存 CreateService 的 deploymentConfiguration，所以直接檢查你送出的內容
const sent: { cmd: string, input: any }[] = []

before(async () => {
  await requireMoto()
  sess = await session(dir)
  ecr = client(ECRClient, sess)
  ecs = client(ECSClient, sess)
  ecs.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    sent.push({ cmd: ctx.commandName, input: structuredClone(args.input) })
    return next(args)
  }, { step: 'initialize', name: 'recordEcs' })
  const ec2 = client(EC2Client, sess)
  const vpc = (await ec2.send(new CreateVpcCommand({ CidrBlock: '10.5.0.0/16' }))).Vpc!.VpcId!
  const a = (await ec2.send(new CreateSubnetCommand({ VpcId: vpc, CidrBlock: '10.5.11.0/24', AvailabilityZone: `${REGION}a` }))).Subnet!.SubnetId!
  const c = (await ec2.send(new CreateSubnetCommand({ VpcId: vpc, CidrBlock: '10.5.12.0/24', AvailabilityZone: `${REGION}c` }))).Subnet!.SubnetId!
  const sg = (await ec2.send(new CreateSecurityGroupCommand({ VpcId: vpc, GroupName: 'cafe-05-app', Description: 'app tasks' }))).GroupId!
  const sm = client(SecretsManagerClient, sess)
  const secret = await sm.send(new CreateSecretCommand({ Name: `cafe-05-ex3/db-${Date.now()}`, SecretString: 'postgresql://pf_app:x@db:5432/my_saas' }))
  opts = {
    name: NAME, digest: D1,
    executionRoleArn: `arn:aws:iam::${sess.account}:role/cafe-api-execution`,
    taskRoleArn: `arn:aws:iam::${sess.account}:role/cafe-api-task`,
    dbSecretArn: secret.ARN!, subnets: [a, c], securityGroups: [sg], desiredCount: 2,
  }
})

after(async () => {
  await ecs?.send(new DeleteServiceCommand({ cluster: NAME, service: NAME, force: true })).catch(() => {})
  await ecs?.send(new DeleteClusterCommand({ cluster: NAME })).catch(() => {})
  await ecr?.send(new DeleteRepositoryCommand({ repositoryName: NAME, force: true })).catch(() => {})
})

let first: Awaited<ReturnType<typeof deployApi>>
test('ECR repository：tag 不可變、push 時掃描', async () => {
  first = await deployApi({ ecr, ecs }, opts)
  const r = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [NAME] }))
  const repo = r.repositories![0]
  assert.equal(repo.imageTagMutability, 'IMMUTABLE', 'imageTagMutability 要是 IMMUTABLE：同一個 tag 不能被覆蓋成別的映像')
  assert.equal(repo.imageScanningConfiguration?.scanOnPush, true, 'imageScanningConfiguration.scanOnPush 要是 true')
  assert.equal(first.imageUri, `${repo.repositoryUri}@${D1}`, '映像要用 <repositoryUri>@<digest>，不能用 :latest 這種會變的 tag')
})

test('task definition：Fargate、awsvpc、兩個 role 分開、secret 不寫在環境變數', async () => {
  const { taskDefinition: td } = await ecs.send(new DescribeTaskDefinitionCommand({ taskDefinition: first.taskDefinitionArn }))
  assert.ok(td!.requiresCompatibilities?.includes('FARGATE'), 'requiresCompatibilities 要有 FARGATE')
  assert.equal(td!.networkMode, 'awsvpc', 'Fargate 一定要用 networkMode: awsvpc')
  assert.equal(td!.cpu, '512', 'cpu 用 512（0.5 vCPU）')
  assert.equal(td!.memory, '1024', 'memory 用 1024（1 GB），是 0.5 vCPU 合法的組合')
  assert.equal(td!.executionRoleArn, opts.executionRoleArn, 'executionRoleArn 要用 opts.executionRoleArn：拉映像、寫 log、讀 secret 是 ECS 代理人的事')
  assert.equal(td!.taskRoleArn, opts.taskRoleArn, 'taskRoleArn 要用 opts.taskRoleArn：你的程式呼叫 S3、SQS 用的是它')
  const api = td!.containerDefinitions?.find(c => c.name === 'api')
  assert.ok(api, '要有一個名稱是 api 的容器')
  assert.equal(api!.image, first.imageUri, '容器的 image 要是 <repositoryUri>@<digest>')
  assert.ok(api!.portMappings?.some(p => p.containerPort === 3100), '容器要開 port 3100（cafe-api 聽的 port）')
  assert.deepEqual(api!.secrets?.find(s => s.name === 'APP_DATABASE_URL'), { name: 'APP_DATABASE_URL', valueFrom: opts.dbSecretArn },
    'APP_DATABASE_URL 要用 secrets: [{ name, valueFrom: secret 的 ARN }] 注入，ECS 啟動時才去 Secrets Manager 讀')
  const env = api!.environment ?? []
  assert.ok(!env.some(e => e.name === 'APP_DATABASE_URL' || e.value === opts.dbSecretArn),
    'APP_DATABASE_URL 不能放在 environment：environment 是明文，任何能讀 task definition 的人都看得到')
  const log = api!.logConfiguration
  assert.equal(log?.logDriver, 'awslogs', 'logConfiguration.logDriver 要是 awslogs，不然 task 一停 log 就沒了')
  assert.equal(log?.options?.['awslogs-group'], `/ecs/${NAME}`, `awslogs-group 用 /ecs/${NAME}`)
  assert.equal(log?.options?.['awslogs-region'], REGION, 'awslogs-region 用 client 的 region（await ecs.config.region()）')
  assert.ok(log?.options?.['awslogs-stream-prefix'], '要設 awslogs-stream-prefix，log stream 才找得到是哪個 task')
})

test('service：Fargate、私有子網路不給公開 IP、circuit breaker 會回滾、100／200', async () => {
  const create = sent.filter(s => s.cmd === 'CreateServiceCommand')
  assert.equal(create.length, 1, '第一次部署要送出 1 次 CreateService')
  const input = create[0].input
  assert.equal(input.cluster, NAME, 'cluster 用 opts.name')
  assert.equal(input.launchType, 'FARGATE', 'launchType 要是 FARGATE')
  assert.equal(input.desiredCount, 2, 'desiredCount 用 opts.desiredCount')
  const net = input.networkConfiguration?.awsvpcConfiguration
  assert.deepEqual(net?.subnets, opts.subnets, 'subnets 用 opts.subnets（私有子網路）')
  assert.deepEqual(net?.securityGroups, opts.securityGroups, 'securityGroups 用 opts.securityGroups')
  assert.equal(net?.assignPublicIp, 'DISABLED', 'assignPublicIp 要是 DISABLED：task 在私有子網路，對外走 NAT 或 VPC endpoint，不直接暴露在網際網路')
  const dc = input.deploymentConfiguration
  assert.deepEqual(dc?.deploymentCircuitBreaker, { enable: true, rollback: true }, 'deploymentCircuitBreaker 要 { enable: true, rollback: true }：新版起不來時自動退回上一版')
  assert.equal(dc?.minimumHealthyPercent, 100, 'minimumHealthyPercent 用 100：部署中不少於原本的數量')
  assert.equal(dc?.maximumPercent, 200, 'maximumPercent 用 200：先開新的再關舊的')
  const r = await ecs.send(new DescribeServicesCommand({ cluster: NAME, services: [NAME] }))
  assert.equal(r.services?.[0]?.status, 'ACTIVE', `cluster ${NAME} 裡要有一個名稱是 ${NAME} 的 service`)
})

test('第二次部署：註冊新的 revision，用 UpdateService 換版，不能再 CreateService', async () => {
  const before = sent.length
  const second = await deployApi({ ecr, ecs }, { ...opts, digest: D2 })
  const calls = sent.slice(before)
  assert.notEqual(second.taskDefinitionArn, first.taskDefinitionArn, '新的 digest 要註冊出新的 task definition revision')
  assert.match(second.taskDefinitionArn, /:2$/, '同一個 family 第二次註冊是 revision 2')
  assert.equal(calls.filter(s => s.cmd === 'CreateServiceCommand').length, 0,
    'service 已經存在時不能再 CreateService：真的 AWS 會拒絕（或建出不一樣的設定）；先 DescribeServices，存在就 UpdateService')
  const upd = calls.find(s => s.cmd === 'UpdateServiceCommand')
  assert.ok(upd, '第二次部署要送出 UpdateService')
  assert.equal(upd!.input.taskDefinition, second.taskDefinitionArn, 'UpdateService 的 taskDefinition 要換成這次註冊出來的 ARN')
  assert.equal(second.imageUri.endsWith(`@${D2}`), true, '第二次部署的映像要用新的 digest')
})
