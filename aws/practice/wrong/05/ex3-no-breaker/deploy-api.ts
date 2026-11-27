// 練習 3：把 cafe-api 部署到 ECS Fargate：ECR repository → task definition → cluster → service
import { CreateRepositoryCommand, DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr'
import { CreateClusterCommand, CreateServiceCommand, DescribeServicesCommand, ECSClient, RegisterTaskDefinitionCommand, UpdateServiceCommand } from '@aws-sdk/client-ecs'

export type DeployOpts = {
  name: string               // repository、cluster、task definition family、service 都用這個名稱
  digest: string             // 這次要部署的映像 digest，例如 sha256:3f…
  executionRoleArn: string   // ECS 拉映像、寫 log、讀 secret 用
  taskRoleArn: string        // 你的程式呼叫 AWS 用
  dbSecretArn: string        // Secrets Manager 裡資料庫連線字串的 ARN
  subnets: string[]          // 私有子網路
  securityGroups: string[]
  desiredCount: number
}

async function ensureRepository(ecr: ECRClient, name: string): Promise<string> {
  try {
    const r = await ecr.send(new CreateRepositoryCommand({
      repositoryName: name,
      imageTagMutability: 'IMMUTABLE',
      imageScanningConfiguration: { scanOnPush: true },
    }))
    return r.repository!.repositoryUri!
  } catch (e) {
    if ((e as Error).name !== 'RepositoryAlreadyExistsException') throw e
    const r = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [name] }))
    return r.repositories![0].repositoryUri!
  }
}

export async function deployApi(c: { ecr: ECRClient, ecs: ECSClient }, opts: DeployOpts) {
  const { name } = opts
  const repositoryUri = await ensureRepository(c.ecr, name)
  const imageUri = `${repositoryUri}@${opts.digest}`
  const region = await c.ecs.config.region()

  const td = await c.ecs.send(new RegisterTaskDefinitionCommand({
    family: name,
    requiresCompatibilities: ['FARGATE'],
    networkMode: 'awsvpc',
    cpu: '512',
    memory: '1024',
    executionRoleArn: opts.executionRoleArn,
    taskRoleArn: opts.taskRoleArn,
    containerDefinitions: [{
      name: 'api',
      image: imageUri,
      essential: true,
      portMappings: [{ containerPort: 3100, protocol: 'tcp' }],
      environment: [{ name: 'PORT', value: '3100' }],
      secrets: [{ name: 'APP_DATABASE_URL', valueFrom: opts.dbSecretArn }],
      logConfiguration: {
        logDriver: 'awslogs',
        options: { 'awslogs-group': `/ecs/${name}`, 'awslogs-region': region, 'awslogs-stream-prefix': 'api' },
      },
    }],
  }))
  const taskDefinitionArn = td.taskDefinition!.taskDefinitionArn!

  await c.ecs.send(new CreateClusterCommand({ clusterName: name }))

  const found = await c.ecs.send(new DescribeServicesCommand({ cluster: name, services: [name] }))
  const exists = found.services?.some(s => s.status === 'ACTIVE')
  const deploymentConfiguration = {
    minimumHealthyPercent: 100,
    maximumPercent: 200,
    deploymentCircuitBreaker: { enable: false, rollback: false },
  }
  const svc = exists
    ? await c.ecs.send(new UpdateServiceCommand({ cluster: name, service: name, taskDefinition: taskDefinitionArn, desiredCount: opts.desiredCount, deploymentConfiguration }))
    : await c.ecs.send(new CreateServiceCommand({
      cluster: name,
      serviceName: name,
      taskDefinition: taskDefinitionArn,
      desiredCount: opts.desiredCount,
      launchType: 'FARGATE',
      networkConfiguration: { awsvpcConfiguration: { subnets: opts.subnets, securityGroups: opts.securityGroups, assignPublicIp: 'DISABLED' } },
      deploymentConfiguration,
    }))
  return { imageUri, taskDefinitionArn, serviceArn: svc.service!.serviceArn! }
}
