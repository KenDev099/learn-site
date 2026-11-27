// 練習 2、3 的測試共用：準備模擬帳號裡的 client、第 3、4 課做好的網路與憑證，並記下 deploy 送出的每一個請求。
// 重複執行會找回同一組網路（用 Name 標籤找），不會一直建新的 VPC
import { ACMClient, ListCertificatesCommand, RequestCertificateCommand } from '@aws-sdk/client-acm'
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch'
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { CreateSecurityGroupCommand, CreateSubnetCommand, CreateVpcCommand, DescribeSecurityGroupsCommand, DescribeSubnetsCommand, DescribeVpcsCommand, EC2Client } from '@aws-sdk/client-ec2'
import { ECRClient } from '@aws-sdk/client-ecr'
import { ECSClient } from '@aws-sdk/client-ecs'
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2'
import { IAMClient } from '@aws-sdk/client-iam'
import { KMSClient } from '@aws-sdk/client-kms'
import { RDSClient } from '@aws-sdk/client-rds'
import { S3Client } from '@aws-sdk/client-s3'
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { SNSClient } from '@aws-sdk/client-sns'
import { client, REGION, session, type Session } from '../../helpers/aws.ts'
import type { Clients, Network } from './deploy.ts'

export type Sent = { cmd: string, input: any }

// 每次執行用一個新的環境名稱（例如 ex2-mf3k）：同一個 work 資料夾重跑時，不會撞到上一次建的資源
export async function prepare(dir: string, base: string) {
  const env = `${base}-${Date.now().toString(36).slice(-4)}`
  const sess: Session = await session(dir)
  const sent: Sent[] = []
  const make = <T>(Ctor: new (config: any) => T): T => {
    const c: any = client(Ctor, sess)
    c.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
      sent.push({ cmd: ctx.commandName, input: structuredClone(args.input) })
      return next(args)
    }, { step: 'initialize', name: 'recordDeploy' })
    return c
  }
  const c: Clients = {
    ecr: make(ECRClient), ecs: make(ECSClient), elb: make(ElasticLoadBalancingV2Client), iam: make(IAMClient), kms: make(KMSClient),
    s3: make(S3Client), sm: make(SecretsManagerClient), logs: make(CloudWatchLogsClient), cw: make(CloudWatchClient), rds: make(RDSClient), sns: make(SNSClient),
  }
  const net = await network(client(EC2Client, sess), client(ACMClient, sess), `my-saas-${base}-test`)
  return { c, net, sent, opts: { env, account: sess.account, region: REGION, imageTag: '3f9c2a1', redisUrl: 'rediss://my-saas.cache.test:6379' } }
}

async function network(ec2: EC2Client, acm: ACMClient, name: string): Promise<Network> {
  const tag = (type: any) => [{ ResourceType: type, Tags: [{ Key: 'Name', Value: name }] }]
  let vpcId = (await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: 'tag:Name', Values: [name] }] }))).Vpcs?.[0]?.VpcId
  vpcId ??= (await ec2.send(new CreateVpcCommand({ CidrBlock: '10.20.0.0/16', TagSpecifications: tag('vpc') }))).Vpc!.VpcId!
  const subnet = async (cidr: string, az: string) => {
    const found = (await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId!] }, { Name: 'cidr-block', Values: [cidr] }] }))).Subnets?.[0]
    return found?.SubnetId ?? (await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: cidr, AvailabilityZone: az }))).Subnet!.SubnetId!
  }
  const sg = async (group: string) => {
    const found = (await ec2.send(new DescribeSecurityGroupsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId!] }, { Name: 'group-name', Values: [group] }] }))).SecurityGroups?.[0]
    return found?.GroupId ?? (await ec2.send(new CreateSecurityGroupCommand({ GroupName: group, Description: group, VpcId: vpcId }))).GroupId!
  }
  const domain = 'api.my-saas.test'
  const certs = (await acm.send(new ListCertificatesCommand({}))).CertificateSummaryList ?? []
  const certificateArn = certs.find(x => x.DomainName === domain)?.CertificateArn
    ?? (await acm.send(new RequestCertificateCommand({ DomainName: domain, ValidationMethod: 'DNS' }))).CertificateArn!
  return {
    vpcId,
    publicSubnets: [await subnet('10.20.0.0/24', 'ap-northeast-1a'), await subnet('10.20.1.0/24', 'ap-northeast-1c')],
    privateSubnets: [await subnet('10.20.10.0/24', 'ap-northeast-1a'), await subnet('10.20.11.0/24', 'ap-northeast-1c')],
    albSg: await sg('alb-sg'), appSg: await sg('app-sg'), dbSg: await sg('db-sg'),
    certificateArn,
  }
}
