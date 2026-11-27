// 期末專題：把作品專案課的 my-saas（NestJS＋Prisma＋PostgreSQL＋Redis）部署到 AWS。
// 這裡用 SDK 一步步建，讓你看清楚每個資源和它們的關係；真的專案用 OpenTofu（devops 課第 20 課）寫成宣告式的設定。
// 規則：每個 ensureX 先查、沒有才建，所以整支程式可以重複執行（第二次不會多建、也不會改掉已經存在的機密）
import { CloudWatchClient, PutMetricAlarmCommand } from '@aws-sdk/client-cloudwatch'
import { CloudWatchLogsClient, CreateLogGroupCommand, DescribeLogGroupsCommand, PutRetentionPolicyCommand } from '@aws-sdk/client-cloudwatch-logs'
import { CreateRepositoryCommand, DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr'
import { CreateClusterCommand, CreateServiceCommand, DescribeServicesCommand, ECSClient, RegisterTaskDefinitionCommand, UpdateServiceCommand } from '@aws-sdk/client-ecs'
import {
  CreateListenerCommand, CreateLoadBalancerCommand, CreateTargetGroupCommand, DescribeListenersCommand, DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand, ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2'
import { CreateRoleCommand, GetRoleCommand, IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam'
import { CreateAliasCommand, CreateKeyCommand, DescribeKeyCommand, KMSClient } from '@aws-sdk/client-kms'
import { CreateDBInstanceCommand, CreateDBSubnetGroupCommand, DescribeDBInstancesCommand, DescribeDBSubnetGroupsCommand, RDSClient } from '@aws-sdk/client-rds'
import {
  CreateBucketCommand, HeadBucketCommand, PutBucketEncryptionCommand, PutBucketTaggingCommand, PutPublicAccessBlockCommand, S3Client,
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3'
import { CreateSecretCommand, DescribeSecretCommand, GetRandomPasswordCommand, GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { CreateTopicCommand, SNSClient } from '@aws-sdk/client-sns'

export type Clients = {
  ecr: ECRClient, ecs: ECSClient, elb: ElasticLoadBalancingV2Client, iam: IAMClient, kms: KMSClient, s3: S3Client,
  sm: SecretsManagerClient, logs: CloudWatchLogsClient, cw: CloudWatchClient, rds: RDSClient, sns: SNSClient,
}
// 第 3、4 課做好的網路與憑證：ALB 在公有子網路，task 與資料庫在私有子網路
export type Network = {
  vpcId: string, publicSubnets: string[], privateSubnets: string[],
  albSg: string, appSg: string, dbSg: string, certificateArn: string,
}
export type Options = { env: string, account: string, region: string, imageTag: string, redisUrl: string }
type Tag = { Key: string, Value: string }

const PROJECT = 'my-saas'
const PORT = 3100

export async function deploy(c: Clients, net: Network, o: Options) {
  const name = `${PROJECT}-${o.env}`
  // 成本分攤標籤：每個資源都帶，到 Billing 啟用後，帳單可以依專案、環境拆開
  const tags: Tag[] = [{ Key: 'Project', Value: PROJECT }, { Key: 'Environment', Value: o.env }]

  const repoUri = await ensureRepository(c, name, tags)
  const logGroup = await ensureLogGroup(c, `/ecs/${name}`, tags)
  const keyArn = await ensureKey(c, name, tags)
  const bucket = await ensureBucket(c, `${name}-files-${o.account}`, keyArn, o.region, tags)

  // 資料庫：擁有者（migration 用）的密碼先放進 Secrets Manager，再拿它建 RDS
  const random = async () => (await c.sm.send(new GetRandomPasswordCommand({ PasswordLength: 32, ExcludePunctuation: true }))).RandomPassword!
  const ownerSecret = await ensureSecret(c, `${name}/db-owner`, async () => JSON.stringify({ username: 'owner', password: await random() }), tags)
  const owner = JSON.parse((await c.sm.send(new GetSecretValueCommand({ SecretId: ownerSecret }))).SecretString!)
  const db = await ensureDatabase(c, name, net, owner, tags)
  const dbUrl = (user: string, password: string) => `postgresql://${user}:${password}@${db.host}:${db.port}/my_saas`
  const migrateSecret = await ensureSecret(c, `${name}/migrate`, async () => JSON.stringify({ DATABASE_URL: dbUrl('owner', owner.password) }), tags)
  // pf_app 的密碼：migration 建好角色後，要用擁有者執行一次 ALTER ROLE pf_app PASSWORD …（見課文）
  const appSecret = await ensureSecret(c, `${name}/app`, async () => JSON.stringify({
    APP_DATABASE_URL: dbUrl('pf_app', await random()), JWT_SECRET: await random() + await random(),
  }), tags)

  // 兩個 role：execution role 給 ECS 拉映像、寫 log、注入 secret；task role 給程式自己呼叫 AWS
  const trust = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'ecs-tasks.amazonaws.com' }, Action: 'sts:AssumeRole' }] }
  const repoArn = `arn:aws:ecr:${o.region}:${o.account}:repository/${name}`
  const logArn = `arn:aws:logs:${o.region}:${o.account}:log-group:${logGroup}:*`
  const executionRole = await ensureRole(c, `${name}-execution`, trust, {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
      { Effect: 'Allow', Action: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'], Resource: repoArn },
      { Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: logArn },
    ],
  }, tags)
  const taskRole = await ensureRole(c, `${name}-task`, trust, {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: `arn:aws:s3:::${bucket}/tenants/*` },
      { Effect: 'Allow', Action: 'secretsmanager:GetSecretValue', Resource: [appSecret, migrateSecret] },
    ],
  }, tags)

  // 入口：ALB（公有子網路）→ target group → task（私有子網路）
  const tg = await ensureTargetGroup(c, name, net.vpcId, '/api/v1/health/ready', tags)
  const alb = await ensureLoadBalancer(c, name, net, tg, tags)

  // task definition：api 只拿 pf_app 的連線字串；migration 是另一個 task definition，只有它拿得到擁有者的密碼
  const log = (prefix: string) => ({ logDriver: 'awslogs', options: { 'awslogs-group': logGroup, 'awslogs-region': o.region, 'awslogs-stream-prefix': prefix } })
  const ecsTags = tags.map(t => ({ key: t.Key, value: t.Value }))
  const api = await c.ecs.send(new RegisterTaskDefinitionCommand({
    family: `${name}-api`, requiresCompatibilities: ['FARGATE'], networkMode: 'awsvpc', cpu: '512', memory: '1024',
    executionRoleArn: executionRole, taskRoleArn: taskRole, tags: ecsTags,
    containerDefinitions: [{
      name: 'api', image: `${repoUri}:${o.imageTag}`, essential: true,
      portMappings: [{ containerPort: PORT }],
      environment: [
        { name: 'NODE_ENV', value: 'production' }, { name: 'PORT', value: String(PORT) },
        { name: 'REDIS_URL', value: o.redisUrl }, { name: 'S3_BUCKET', value: bucket },
      ],
      secrets: [
        { name: 'APP_DATABASE_URL', valueFrom: `${appSecret}:APP_DATABASE_URL::` },
        { name: 'JWT_SECRET', valueFrom: `${appSecret}:JWT_SECRET::` },
        { name: 'DATABASE_URL', valueFrom: `${migrateSecret}:DATABASE_URL::` },   // 方便在容器裡手動跑 migration
      ],
      logConfiguration: log('api'),
    }],
  }))
  const migrate = await c.ecs.send(new RegisterTaskDefinitionCommand({
    family: `${name}-migrate`, requiresCompatibilities: ['FARGATE'], networkMode: 'awsvpc', cpu: '256', memory: '512',
    executionRoleArn: executionRole, tags: ecsTags,
    containerDefinitions: [{
      // 用 build 階段的映像：裡面才有 devDependencies 的 prisma CLI（作品專案課第 17 課）
      name: 'migrate', image: `${repoUri}:${o.imageTag}-build`, essential: true,
      command: ['npx', 'prisma', 'migrate', 'deploy'],
      secrets: [{ name: 'DATABASE_URL', valueFrom: `${migrateSecret}:DATABASE_URL::` }],
      logConfiguration: log('migrate'),
    }],
  }))

  await c.ecs.send(new CreateClusterCommand({ clusterName: name, tags: ecsTags }))   // 同名的 cluster 已存在時會直接回傳它
  await ensureService(c, name, api.taskDefinition!.taskDefinitionArn!, net, tg, ecsTags)

  const topic = (await c.sns.send(new CreateTopicCommand({ Name: `${name}-alerts`, Tags: tags }))).TopicArn!
  await ensureAlarms(c, name, alb, tg, name, topic, tags)

  return {
    repoUri, logGroup, keyArn, bucket, dbHost: db.host, ownerSecret, migrateSecret, appSecret, executionRole, taskRole,
    targetGroup: tg, loadBalancer: alb, apiTaskDefinition: api.taskDefinition!.taskDefinitionArn!,
    migrateTaskDefinition: migrate.taskDefinition!.taskDefinitionArn!, topic,
  }
}

const notFound = (...names: string[]) => (e: Error) => { if (names.includes(e.name)) return undefined; throw e }

async function ensureRepository(c: Clients, name: string, tags: Tag[]) {
  const found = await c.ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [name] })).catch(notFound('RepositoryNotFoundException'))
  if (found) return found.repositories![0].repositoryUri!
  // 標籤不可變：同一個 commit SHA 永遠是同一個映像；推上去時掃描漏洞
  const r = await c.ecr.send(new CreateRepositoryCommand({
    repositoryName: name, imageTagMutability: 'IMMUTABLE', imageScanningConfiguration: { scanOnPush: true }, tags,
  }))
  return r.repository!.repositoryUri!
}

// 練習 2：log group 沒有就建（tags 是物件：{ Project: …, Environment: … }），保留天數設 30（PutRetentionPolicyCommand）。
// 不設的話預設是永久保存。回傳 log group 名稱
async function ensureLogGroup(c: Clients, name: string, tags: Tag[]): Promise<string> {
  throw new Error('還沒寫：ensureLogGroup')
}

async function ensureKey(c: Clients, name: string, tags: Tag[]) {
  const alias = `alias/${name}`
  const found = await c.kms.send(new DescribeKeyCommand({ KeyId: alias })).catch(notFound('NotFoundException'))
  if (found) return found.KeyMetadata!.Arn!
  const key = await c.kms.send(new CreateKeyCommand({ Description: `${name} files`, Tags: tags.map(t => ({ TagKey: t.Key, TagValue: t.Value })) }))
  await c.kms.send(new CreateAliasCommand({ AliasName: alias, TargetKeyId: key.KeyMetadata!.KeyId! }))
  return key.KeyMetadata!.Arn!
}

async function ensureBucket(c: Clients, bucket: string, keyArn: string, region: string, tags: Tag[]) {
  const found = await c.s3.send(new HeadBucketCommand({ Bucket: bucket })).catch(notFound('NotFound', 'NoSuchBucket'))
  if (!found) {
    await c.s3.send(new CreateBucketCommand({
      Bucket: bucket, ...(region === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: region as BucketLocationConstraint } }),
    }))
  }
  await c.s3.send(new PutPublicAccessBlockCommand({ Bucket: bucket, PublicAccessBlockConfiguration: {
    BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } }))
  await c.s3.send(new PutBucketEncryptionCommand({ Bucket: bucket, ServerSideEncryptionConfiguration: { Rules: [{
    ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: keyArn }, BucketKeyEnabled: true }] } }))
  await c.s3.send(new PutBucketTaggingCommand({ Bucket: bucket, Tagging: { TagSet: tags } }))
  return bucket
}

// 練習 2：secret 已經存在（DescribeSecretCommand 找得到）就回傳它的 ARN，不要呼叫 makeValue、不要覆寫；
// 不存在（ResourceNotFoundException）才用 makeValue() 產生值、CreateSecretCommand 建立（帶 Tags），回傳 ARN
async function ensureSecret(c: Clients, name: string, makeValue: () => Promise<string>, tags: Tag[]): Promise<string> {
  throw new Error('還沒寫：ensureSecret')
}

// 練習 2：RDS PostgreSQL。DescribeDBInstancesCommand 找不到（DBInstanceNotFoundFault）才建：
// 先建 DB subnet group（名稱 name、私有子網路），再 CreateDBInstanceCommand：Engine postgres、DBName my_saas、
// 帳號密碼用 owner、Multi-AZ、自動備份保留 7 天、儲存加密、不公開、開防誤刪、subnet group 與 db-sg、Tags。
// 最後回傳 Endpoint 的 { host, port }（再 Describe 一次）
async function ensureDatabase(c: Clients, name: string, net: Network, owner: { username: string, password: string }, tags: Tag[]): Promise<{ host: string, port: number }> {
  throw new Error('還沒寫：ensureDatabase')
}

async function ensureRole(c: Clients, name: string, trust: object, policy: object, tags: Tag[]) {
  const found = await c.iam.send(new GetRoleCommand({ RoleName: name })).catch(notFound('NoSuchEntityException'))
  const arn = found?.Role!.Arn ?? (await c.iam.send(new CreateRoleCommand({ RoleName: name, AssumeRolePolicyDocument: JSON.stringify(trust), Tags: tags }))).Role!.Arn!
  await c.iam.send(new PutRolePolicyCommand({ RoleName: name, PolicyName: 'main', PolicyDocument: JSON.stringify(policy) }))   // 每次都寫入最新版本
  return arn
}

async function ensureTargetGroup(c: Clients, name: string, vpcId: string, healthPath: string, tags: Tag[]) {
  const found = await c.elb.send(new DescribeTargetGroupsCommand({ Names: [name] })).catch(notFound('TargetGroupNotFoundException'))
  if (found) return found.TargetGroups![0].TargetGroupArn!
  const r = await c.elb.send(new CreateTargetGroupCommand({
    Name: name, Protocol: 'HTTP', Port: PORT, VpcId: vpcId, TargetType: 'ip',     // Fargate 用 awsvpc，目標是 task 的 IP
    HealthCheckPath: healthPath, HealthCheckIntervalSeconds: 10, HealthyThresholdCount: 2, UnhealthyThresholdCount: 3, Matcher: { HttpCode: '200' }, Tags: tags,
  }))
  return r.TargetGroups![0].TargetGroupArn!
}

async function ensureLoadBalancer(c: Clients, name: string, net: Network, tg: string, tags: Tag[]) {
  const found = await c.elb.send(new DescribeLoadBalancersCommand({ Names: [name] })).catch(notFound('LoadBalancerNotFoundException'))
  const arn = found?.LoadBalancers![0].LoadBalancerArn
    ?? (await c.elb.send(new CreateLoadBalancerCommand({ Name: name, Type: 'application', Scheme: 'internet-facing', Subnets: net.publicSubnets, SecurityGroups: [net.albSg], Tags: tags }))).LoadBalancers![0].LoadBalancerArn!
  const listeners = (await c.elb.send(new DescribeListenersCommand({ LoadBalancerArn: arn }))).Listeners ?? []
  if (!listeners.some(l => l.Port === 443)) {
    await c.elb.send(new CreateListenerCommand({ LoadBalancerArn: arn, Protocol: 'HTTPS', Port: 443, Certificates: [{ CertificateArn: net.certificateArn }],
      SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06', DefaultActions: [{ Type: 'forward', TargetGroupArn: tg }] }))
  }
  if (!listeners.some(l => l.Port === 80)) {
    await c.elb.send(new CreateListenerCommand({ LoadBalancerArn: arn, Protocol: 'HTTP', Port: 80,
      DefaultActions: [{ Type: 'redirect', RedirectConfig: { Protocol: 'HTTPS', Port: '443', StatusCode: 'HTTP_301' } }] }))
  }
  return arn
}

async function ensureService(c: Clients, name: string, taskDefinition: string, net: Network, tg: string, tags: { key: string, value: string }[]) {
  const found = (await c.ecs.send(new DescribeServicesCommand({ cluster: name, services: ['api'] }))).services?.find(s => s.status === 'ACTIVE')
  if (found) {
    await c.ecs.send(new UpdateServiceCommand({ cluster: name, service: 'api', taskDefinition, desiredCount: 2 }))   // 新版本：換 task definition
    return
  }
  await c.ecs.send(new CreateServiceCommand({
    cluster: name, serviceName: 'api', taskDefinition, desiredCount: 2, launchType: 'FARGATE',
    networkConfiguration: { awsvpcConfiguration: { subnets: net.privateSubnets, securityGroups: [net.appSg], assignPublicIp: 'DISABLED' } },
    loadBalancers: [{ targetGroupArn: tg, containerName: 'api', containerPort: PORT }],
    healthCheckGracePeriodSeconds: 60,
    deploymentConfiguration: { minimumHealthyPercent: 100, maximumPercent: 200, deploymentCircuitBreaker: { enable: true, rollback: true } },
    propagateTags: 'SERVICE', tags,
  }))
}


// 練習 2：三個告警（PutMetricAlarmCommand），AlarmActions 與 OKActions 都是 topic，帶 Tags：
//   <name>-alb-5xx：AWS/ApplicationELB 的 HTTPCode_Target_5XX_Count，Sum、每 60 秒、5 個週期裡 3 個超過 10 就告警，沒有資料（沒流量）不算異常
//   <name>-unhealthy-hosts：AWS/ApplicationELB 的 UnHealthyHostCount，Minimum、每 60 秒、連續 2 個週期大於 0
//   <name>-db-free-storage：AWS/RDS 的 FreeStorageSpace（維度 DBInstanceIdentifier），Minimum、每 300 秒、小於 2 GiB（位元組）
// ALB 兩個告警的維度是 LoadBalancer 與 TargetGroup，值不是整個 ARN（見課文）
async function ensureAlarms(c: Clients, name: string, alb: string, tg: string, dbId: string, topic: string, tags: Tag[]): Promise<void> {
  throw new Error('還沒寫：ensureAlarms')
}
