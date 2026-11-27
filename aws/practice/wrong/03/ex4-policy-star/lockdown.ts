// 練習 4：三層安全群組用「安全群組參照」串起來，S3 流量走 gateway endpoint
import { AuthorizeSecurityGroupIngressCommand, CreateSecurityGroupCommand, CreateVpcEndpointCommand, EC2Client } from '@aws-sdk/client-ec2'

type Options = { vpcId: string, privateRouteTableIds: string[], bucket: string }
type Result = { albSg: string, appSg: string, dbSg: string, endpointId: string }

export async function lockdown(ec2: EC2Client, { vpcId, privateRouteTableIds, bucket }: Options): Promise<Result> {
  const group = async (name: string, description: string) =>
    (await ec2.send(new CreateSecurityGroupCommand({ GroupName: name, Description: description, VpcId: vpcId }))).GroupId!
  const albSg = await group('cafe-03-alb', 'ALB: HTTPS from the internet')
  const appSg = await group('cafe-03-app', 'cafe-api: only from the ALB')
  const dbSg = await group('cafe-03-db', 'PostgreSQL: only from cafe-api')

  await ec2.send(new AuthorizeSecurityGroupIngressCommand({ GroupId: albSg, IpPermissions: [
    { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
  ] }))
  await ec2.send(new AuthorizeSecurityGroupIngressCommand({ GroupId: appSg, IpPermissions: [
    { IpProtocol: 'tcp', FromPort: 3000, ToPort: 3000, UserIdGroupPairs: [{ GroupId: albSg }] },
  ] }))
  await ec2.send(new AuthorizeSecurityGroupIngressCommand({ GroupId: dbSg, IpPermissions: [
    { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, UserIdGroupPairs: [{ GroupId: appSg }] },
  ] }))

  const region = await ec2.config.region()
  const policy = {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
      Resource: "*",
    }],
  }
  const { VpcEndpoint } = await ec2.send(new CreateVpcEndpointCommand({
    VpcId: vpcId,
    VpcEndpointType: 'Gateway',
    ServiceName: `com.amazonaws.${region}.s3`,
    RouteTableIds: privateRouteTableIds,
    PolicyDocument: JSON.stringify(policy),
  }))
  return { albSg, appSg, dbSg, endpointId: VpcEndpoint!.VpcEndpointId! }
}
