// 練習 3：用 Route 53 的 weighted 記錄，把 api 的流量慢慢從舊環境（blue）切到新環境（green）
import { ChangeResourceRecordSetsCommand, CreateHostedZoneCommand, ListHostedZonesByNameCommand, Route53Client } from '@aws-sdk/client-route-53'

// 找到名稱是 name 的 hosted zone，沒有才建立；回傳 zone ID（例如 /hostedzone/Z123…）
export async function ensureZone(r53: Route53Client, name: string): Promise<string> {
  const { HostedZones = [] } = await r53.send(new ListHostedZonesByNameCommand({ DNSName: name }))
  const existing = HostedZones.find(z => z.Name === `${name}.`)
  if (existing) return existing.Id!
  const { HostedZone } = await r53.send(new CreateHostedZoneCommand({ Name: name, CallerReference: `${name}-${Date.now()}` }))
  return HostedZone!.Id!
}

type Cutover = { name: string, blueIp: string, greenIp: string, greenWeight: number }

// 一次請求更新兩筆 weighted A 記錄：blue 權重 100 - greenWeight、green 權重 greenWeight，TTL 60
export async function shiftTraffic(r53: Route53Client, zoneId: string, { name, blueIp, greenIp, greenWeight }: Cutover): Promise<void> {
  const record = (id: string, ip: string, weight: number) => ({
    Action: 'UPSERT' as const,
    ResourceRecordSet: { Name: name, Type: 'A' as const, SetIdentifier: id, Weight: weight, TTL: 3600, ResourceRecords: [{ Value: ip }] },
  })
  await r53.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: {
      Comment: `green ${greenWeight}%`,
      Changes: [record('blue', blueIp, 100 - greenWeight), record('green', greenIp, greenWeight)],
    },
  }))
}
