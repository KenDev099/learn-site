// 練習 3：ensureZone 不重複建 zone；shiftTraffic 一次請求、UPSERT 兩筆 weighted 記錄
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { ListHostedZonesByNameCommand, ListResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53'
import { client, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { ensureZone, shiftTraffic } from './dns-cutover.ts'

const dir = import.meta.dirname
const ZONE = 'cafe-04.test'
const NAME = 'api.cafe-04.test'
const BLUE = '192.0.2.10', GREEN = '192.0.2.20'
let sess: Session

// 會記下送出的 ChangeResourceRecordSets 的 client：模擬器有些檢查比真的 Route 53 寬鬆（例如同一批裡重複的 SetIdentifier），所以直接檢查你送出的內容
function r53() {
  const c = client(Route53Client, sess)
  const sent: any[] = []
  c.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    if (ctx.commandName === 'ChangeResourceRecordSetsCommand') sent.push(structuredClone(args.input))
    return next(args)
  }, { step: 'initialize', name: 'recordChanges' })
  return { c, sent }
}

async function weights(c: Route53Client, zoneId: string) {
  const { ResourceRecordSets = [] } = await c.send(new ListResourceRecordSetsCommand({ HostedZoneId: zoneId }))
  return ResourceRecordSets.filter(r => r.Name === `${NAME}.` && r.Type === 'A')
    .map(r => ({ id: r.SetIdentifier, weight: r.Weight, ttl: r.TTL, ip: r.ResourceRecords?.[0]?.Value }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

before(async () => {
  await requireMoto()
  sess = await session(dir)
})

test('ensureZone：已經有同名的 zone 就用它，不再建一個', async () => {
  const { c } = r53()
  const count = async () => ((await c.send(new ListHostedZonesByNameCommand({ DNSName: ZONE }))).HostedZones ?? []).filter(z => z.Name === `${ZONE}.`).length
  const before = await count()
  const first = await ensureZone(c, ZONE)
  const afterFirst = await count()
  assert.equal(afterFirst, Math.max(before, 1), before ? `${ZONE} 已經有 hosted zone 了，不能再建一個` : `第一次要建立 ${ZONE}`)
  const second = await ensureZone(c, ZONE)
  assert.equal(second, first, '第二次要回傳同一個 zone ID：Route 53 允許同名的 hosted zone 建很多個，每個的 NS 都不同，建錯了 DNS 會指向沒人用的那個')
  assert.equal(await count(), afterFirst, '第二次呼叫不能再建 hosted zone')
})

test('shiftTraffic：green 10%，一次請求送出兩筆 UPSERT', async () => {
  const { c, sent } = r53()
  const zoneId = await ensureZone(c, ZONE)
  await shiftTraffic(c, zoneId, { name: NAME, blueIp: BLUE, greenIp: GREEN, greenWeight: 10 })
  assert.equal(sent.length, 1, `要用一個 ChangeResourceRecordSets 請求同時改兩筆：分兩次送，中間有一段時間只有一筆記錄在接流量。實際送了 ${sent.length} 次`)
  const changes = sent[0].ChangeBatch?.Changes ?? []
  assert.equal(changes.length, 2, 'ChangeBatch.Changes 要有 blue、green 兩筆')
  assert.deepEqual(changes.map((x: any) => x.Action), ['UPSERT', 'UPSERT'], 'Action 用 UPSERT：記錄已經存在時 CREATE 會失敗，切流量要能重複執行')
  const ids = changes.map((x: any) => x.ResourceRecordSet?.SetIdentifier)
  assert.deepEqual([...ids].sort(), ['blue', 'green'], 'SetIdentifier 分別是 blue、green：同名同類型的 weighted 記錄靠它區分，重複會被拒絕')
  assert.deepEqual(await weights(c, zoneId), [
    { id: 'blue', weight: 90, ttl: 60, ip: BLUE },
    { id: 'green', weight: 10, ttl: 60, ip: GREEN },
  ], '讀回來要是 blue 90、green 10，TTL 都是 60（切換期間 TTL 短，調整才會很快生效）')
})

test('shiftTraffic：再切到 100%，blue 留著權重 0 方便回滾', async () => {
  const { c, sent } = r53()
  const zoneId = await ensureZone(c, ZONE)
  await shiftTraffic(c, zoneId, { name: NAME, blueIp: BLUE, greenIp: GREEN, greenWeight: 100 })
  await shiftTraffic(c, zoneId, { name: NAME, blueIp: BLUE, greenIp: GREEN, greenWeight: 100 })
  assert.equal(sent.length, 2, '每次 shiftTraffic 都只送一次請求')
  assert.ok(sent.every(s => s.ChangeBatch.Changes.every((x: any) => x.Action === 'UPSERT')), '重複執行也要用 UPSERT')
  assert.deepEqual(await weights(c, zoneId), [
    { id: 'blue', weight: 0, ttl: 60, ip: BLUE },
    { id: 'green', weight: 100, ttl: 60, ip: GREEN },
  ], '讀回來要是 blue 0、green 100：只要還有一筆權重大於 0，權重 0 的就不會被回應')
})
