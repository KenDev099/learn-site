// 練習 4：三層安全群組用「安全群組參照」串起來，S3 流量走 gateway endpoint
import { EC2Client } from '@aws-sdk/client-ec2'

type Options = { vpcId: string, privateRouteTableIds: string[], bucket: string }
type Result = { albSg: string, appSg: string, dbSg: string, endpointId: string }

export async function lockdown(ec2: EC2Client, { vpcId, privateRouteTableIds, bucket }: Options): Promise<Result> {
  // 1. CreateSecurityGroupCommand 建 cafe-03-alb、cafe-03-app、cafe-03-db（GroupName、Description、VpcId）
  // 2. AuthorizeSecurityGroupIngressCommand：
  //    alb：tcp 443 來自 0.0.0.0/0
  //    app：tcp 3000 只來自 alb 的安全群組（UserIdGroupPairs）
  //    db：tcp 5432 只來自 app 的安全群組
  // 3. CreateVpcEndpointCommand：Gateway 類型的 S3 endpoint（服務名稱 com.amazonaws.<region>.s3，region 用 await ec2.config.region()），
  //    掛到所有私有 route table，PolicyDocument 只允許這個 bucket
  throw new Error('還沒寫')
}
