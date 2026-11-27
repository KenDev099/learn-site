// 練習 3：把 cafe-api 部署到 ECS Fargate：ECR repository → task definition → cluster → service
import { ECRClient } from '@aws-sdk/client-ecr'
import { ECSClient } from '@aws-sdk/client-ecs'

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

export async function deployApi(c: { ecr: ECRClient, ecs: ECSClient }, opts: DeployOpts) {
  // 1. ECR repository：tag 不可變、push 時掃描；已經存在（RepositoryAlreadyExistsException）就沿用
  // 2. RegisterTaskDefinition：FARGATE、awsvpc、cpu '512'、memory '1024'、兩個 role 分開；
  //    容器 api：映像用 <repositoryUri>@<digest>、port 3100、APP_DATABASE_URL 從 secrets 注入、awslogs
  // 3. CreateCluster
  // 4. service 不存在就 CreateService（私有子網路、不給公開 IP、circuit breaker＋rollback、100／200），存在就 UpdateService 換成新的 task definition
  throw new Error('還沒寫')
}
