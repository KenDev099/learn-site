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
      // bucket 用 SSE-KMS：讀要 Decrypt、寫要 GenerateDataKey，少了就是 AccessDenied
      { Effect: 'Allow', Action: ['kms:Decrypt', 'kms:GenerateDataKey'], Resource: keyArn },
      { Effect: 'Allow', Action: 'secretsmanager:GetSecretValue', Resource: [appSecret, migrateSecret] },
    ],
  }, tags)

  // 入口：ALB（公有子網路）→ target group → task（私有子網路）
  const tg = await ensureTargetGroup(c, name, net.vpcId, '/health/ready', tags)
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

// log group：沒有就建；保留 30 天（預設是永久保存，會一直累積費用）
async function ensureLogGroup(c: Clients, name: string, tags: Tag[]) {
  const found = (await c.logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: name }))).logGroups?.some(g => g.logGroupName === name)
  if (!found) await c.logs.send(new CreateLogGroupCommand({ logGroupName: name, tags: Object.fromEntries(tags.map(t => [t.Key, t.Value])) }))
  await c.logs.send(new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: 30 }))
  return name
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

// secret：已經存在就回傳它的 ARN，不呼叫 makeValue、不覆寫（重新部署不能換掉正在用的密碼）；不存在才產生值並建立
async function ensureSecret(c: Clients, name: string, makeValue: () => Promise<string>, tags: Tag[]) {
  const found = await c.sm.send(new DescribeSecretCommand({ SecretId: name })).catch(notFound('ResourceNotFoundException'))
  if (found) return found.ARN!
  const r = await c.sm.send(new CreateSecretCommand({ Name: name, SecretString: await makeValue(), Tags: tags }))
  return r.ARN!
}

// RDS PostgreSQL：Multi-AZ、保留 7 天自動備份（PITR）、加密、不公開、防誤刪；放在私有子網路，只有 db-sg
async function ensureDatabase(c: Clients, name: string, net: Network, owner: { username: string, password: string }, tags: Tag[]) {
  const describe = () => c.rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: name })).catch(notFound('DBInstanceNotFoundFault'))
  if (!await describe()) {
    const group = await c.rds.send(new DescribeDBSubnetGroupsCommand({ DBSubnetGroupName: name })).catch(notFound('DBSubnetGroupNotFoundFault'))
    if (!group) await c.rds.send(new CreateDBSubnetGroupCommand({ DBSubnetGroupName: name, DBSubnetGroupDescription: name, SubnetIds: net.privateSubnets, Tags: tags }))
    await c.rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: name, Engine: 'postgres', DBInstanceClass: 'db.t4g.small', AllocatedStorage: 20, StorageType: 'gp3',
      DBName: 'my_saas', MasterUsername: owner.username, MasterUserPassword: owner.password,
      MultiAZ: true, BackupRetentionPeriod: 7, StorageEncrypted: true, PubliclyAccessible: false, DeletionProtection: true,
      DBSubnetGroupName: name, VpcSecurityGroupIds: [net.dbSg], CopyTagsToSnapshot: true, Tags: tags,
    }))
  }
  // 真的 AWS 要等幾分鐘 Endpoint 才會出現（aws rds wait db-instance-available）；模擬器立刻就有
  const ep = (await describe())!.DBInstances![0].Endpoint!
  return { host: ep.Address!, port: ep.Port! }
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

// ALB 指標的維度值是 ARN 的 resource 部分（第 1 課：第 5 個冒號之後）：targetgroup/<名稱>/<id>；
// load balancer 還要去掉開頭的 loadbalancer/，變成 app/<名稱>/<id>。寫整個 ARN 不會報錯，只是告警永遠收不到資料
const resource = (arn: string) => arn.split(':').slice(5).join(':')

// 三個告警，觸發與恢復都通知 SNS topic
async function ensureAlarms(c: Clients, name: string, alb: string, tg: string, dbId: string, topic: string, tags: Tag[]) {
  const common = { AlarmActions: [topic], OKActions: [topic], Tags: tags }
  const lbDims = [{ Name: 'LoadBalancer', Value: resource(alb).replace(/^loadbalancer\//, '') }, { Name: 'TargetGroup', Value: resource(tg) }]
  // 5 分鐘內有 3 分鐘、每分鐘超過 10 個 5xx；沒有流量時沒有資料，不算異常
  await c.cw.send(new PutMetricAlarmCommand({ ...common, AlarmName: `${name}-alb-5xx`,
    Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_Target_5XX_Count', Dimensions: lbDims,
    Statistic: 'Sum', Period: 60, EvaluationPeriods: 5, DatapointsToAlarm: 3, Threshold: 10, ComparisonOperator: 'GreaterThanThreshold', TreatMissingData: 'notBreaching' }))
  // 每個 ALB 節點都認為有 target 不健康（Minimum），連續 2 分鐘
  await c.cw.send(new PutMetricAlarmCommand({ ...common, AlarmName: `${name}-unhealthy-hosts`,
    Namespace: 'AWS/ApplicationELB', MetricName: 'UnHealthyHostCount', Dimensions: lbDims,
    Statistic: 'Minimum', Period: 60, EvaluationPeriods: 2, DatapointsToAlarm: 2, Threshold: 0, ComparisonOperator: 'GreaterThanThreshold' }))
  // 資料庫剩不到 2 GiB 的空間
  await c.cw.send(new PutMetricAlarmCommand({ ...common, AlarmName: `${name}-db-free-storage`,
    Namespace: 'AWS/RDS', MetricName: 'FreeStorageSpace', Dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbId }],
    Statistic: 'Minimum', Period: 300, EvaluationPeriods: 1, Threshold: 2 * 1024 ** 3, ComparisonOperator: 'LessThanThreshold' }))
}
