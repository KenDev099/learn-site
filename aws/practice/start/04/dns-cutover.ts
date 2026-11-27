// 練習 3：用 Route 53 的 weighted 記錄，把 api 的流量慢慢從舊環境（blue）切到新環境（green）
import { Route53Client } from '@aws-sdk/client-route-53'

// 找到名稱是 name 的 hosted zone，沒有才建立；回傳 zone ID（例如 /hostedzone/Z123…）
export async function ensureZone(r53: Route53Client, name: string): Promise<string> {
  // 1. ListHostedZonesByNameCommand({ DNSName: name })：回傳的 Name 結尾多一個點（cafe-04.test.）
  // 2. 沒有才 CreateHostedZoneCommand（CallerReference 每次要不同，例如時間戳記）
  throw new Error('還沒寫')
}

type Cutover = { name: string, blueIp: string, greenIp: string, greenWeight: number }

// 一次請求更新兩筆 weighted A 記錄：blue 權重 100 - greenWeight、green 權重 greenWeight，TTL 60
export async function shiftTraffic(r53: Route53Client, zoneId: string, { name, blueIp, greenIp, greenWeight }: Cutover): Promise<void> {
  // ChangeResourceRecordSetsCommand：一個 ChangeBatch 放兩個 UPSERT，SetIdentifier 分別是 'blue'、'green'
  throw new Error('還沒寫')
}
