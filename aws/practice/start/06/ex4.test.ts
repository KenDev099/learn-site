// 練習 4：讀回 Lambda、HTTP API、authorizer、stage 與 resource-based policy 的設定
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { DeleteRoleCommand, GetRoleCommand, IAMClient } from '@aws-sdk/client-iam'
import { DeleteFunctionCommand, GetFunctionCommand, GetPolicyCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { ApiGatewayV2Client, DeleteApiCommand, GetApiCommand, GetAuthorizerCommand, GetIntegrationsCommand, GetRoutesCommand, GetStageCommand } from '@aws-sdk/client-apigatewayv2'
import { client, REGION, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { createOrdersApi, type ApiOpts } from './create-api.ts'

// 做一個只有一個檔案的 zip（Lambda 的程式包），內容不重要：模擬器不會執行它
function crc32(b: Buffer) { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)) } return (~c) >>> 0 }
function zipOne(name: string, text: string): Uint8Array {
  const data = Buffer.from(text), comp = deflateRawSync(data), nm = Buffer.from(name), crc = crc32(data)
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26)
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28)
  const cd = Buffer.concat([ch, nm]), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(lh.length + nm.length + comp.length, 16)
  return Buffer.concat([lh, nm, comp, cd, end])
}

const dir = import.meta.dirname
let sess: Session, iam: IAMClient, lambda: LambdaClient, apigw: ApiGatewayV2Client, opts: ApiOpts
let out: { apiId: string, functionArn: string }

before(async () => {
  await requireMoto()
  sess = await session(dir)
  iam = client(IAMClient, sess); lambda = client(LambdaClient, sess); apigw = client(ApiGatewayV2Client, sess)
  opts = {
    name: `cafe-06-ex4-orders-${Date.now().toString(36)}`,   // 每次執行用新名稱，重跑不會撞到上次的
    zip: zipOne('index.mjs', 'export const handler = async () => ({ ok: true })'),
    frontendOrigin: 'https://cafe.example.com', issuer: 'https://auth.cafe.example.com/', audience: 'cafe-app',
  }
  out = await createOrdersApi({ iam, lambda, apigw }, opts)
})
after(async () => {
  if (out?.apiId) await apigw.send(new DeleteApiCommand({ ApiId: out.apiId })).catch(() => {})
  await lambda?.send(new DeleteFunctionCommand({ FunctionName: opts?.name })).catch(() => {})
  await iam?.send(new DeleteRoleCommand({ RoleName: opts?.name })).catch(() => {})
})

test('execution role 只讓 Lambda 服務扮演；函式設定', async () => {
  const role = await iam.send(new GetRoleCommand({ RoleName: opts.name }))
  const trust = JSON.parse(decodeURIComponent(role.Role!.AssumeRolePolicyDocument!))
  assert.deepEqual(trust.Statement.map((s: any) => s.Principal), [{ Service: 'lambda.amazonaws.com' }], `role ${opts.name} 的信任政策 Principal 要是 { Service: 'lambda.amazonaws.com' }`)
  const { Configuration: f } = await lambda.send(new GetFunctionCommand({ FunctionName: opts.name }))
  assert.equal(out.functionArn, f!.FunctionArn, '回傳的 functionArn 要是 CreateFunction 回來的 ARN')
  assert.equal(f!.Runtime, 'nodejs24.x', 'Runtime 用 nodejs24.x')
  assert.equal(f!.Handler, 'index.handler', 'Handler 用 index.handler（index.mjs 匯出的 handler）')
  assert.deepEqual(f!.Architectures, ['arm64'], 'Architectures 用 [\'arm64\']')
  assert.equal(f!.MemorySize, 512, 'MemorySize 用 512')
  assert.equal(f!.Timeout, 10, 'Timeout 用 10 秒')
})

test('HTTP API 的 CORS 只允許咖啡店前端', async () => {
  const api = await apigw.send(new GetApiCommand({ ApiId: out.apiId }))
  assert.equal(api.ProtocolType, 'HTTP', 'ProtocolType 要是 HTTP')
  const cors = api.CorsConfiguration
  assert.deepEqual(cors?.AllowOrigins, [opts.frontendOrigin], 'AllowOrigins 只能是 opts.frontendOrigin：要帶 Authorization／cookie 的 API 不能允許 *')
  assert.equal(cors?.AllowCredentials, true, 'AllowCredentials 要是 true')
  assert.ok(cors?.AllowHeaders?.map(h => h.toLowerCase()).includes('authorization'), 'AllowHeaders 要有 authorization，瀏覽器才能帶 JWT')
})

test('整合：AWS_PROXY、payload 2.0、整合逾時比函式長', async () => {
  const { Items = [] } = await apigw.send(new GetIntegrationsCommand({ ApiId: out.apiId }))
  assert.equal(Items.length, 1, '要有一個整合')
  const i = Items[0]
  assert.equal(i.IntegrationType, 'AWS_PROXY', 'IntegrationType 要是 AWS_PROXY')
  assert.equal(i.IntegrationUri, out.functionArn, 'IntegrationUri 是函式的 ARN')
  assert.equal(i.PayloadFormatVersion, '2.0', 'PayloadFormatVersion 要是 2.0')
  assert.ok((i.TimeoutInMillis ?? 0) > 10_000 && (i.TimeoutInMillis ?? 0) <= 30_000,
    `TimeoutInMillis 是 ${i.TimeoutInMillis}：要比函式的 10 秒長、不超過 HTTP API 的上限 30 秒。比函式短的話，API 先回 504，函式卻還在跑`)
})

test('兩個 route 都掛 JWT authorizer', async () => {
  const { Items = [] } = await apigw.send(new GetRoutesCommand({ ApiId: out.apiId }))
  const keys = Items.map(r => r.RouteKey).sort()
  assert.deepEqual(keys, ['GET /orders/{id}', 'POST /orders'], '要有 GET /orders/{id} 與 POST /orders 兩個 route')
  for (const r of Items) {
    assert.equal(r.AuthorizationType, 'JWT', `${r.RouteKey} 的 AuthorizationType 要是 JWT：沒掛的 route 誰都能呼叫`)
    const a = await apigw.send(new GetAuthorizerCommand({ ApiId: out.apiId, AuthorizerId: r.AuthorizerId! }))
    assert.equal(a.AuthorizerType, 'JWT', `${r.RouteKey} 掛的 authorizer 要是 JWT 類型`)
    assert.equal(a.JwtConfiguration?.Issuer, opts.issuer, 'JwtConfiguration.Issuer 用 opts.issuer')
    assert.deepEqual(a.JwtConfiguration?.Audience, [opts.audience], 'JwtConfiguration.Audience 用 [opts.audience]')
    assert.deepEqual(a.IdentitySource, ['$request.header.Authorization'], 'IdentitySource 是 [\'$request.header.Authorization\']')
  }
})

test('$default stage 自動部署、有預設節流', async () => {
  const s = await apigw.send(new GetStageCommand({ ApiId: out.apiId, StageName: '$default' }))
  assert.equal(s.AutoDeploy, true, 'AutoDeploy 要是 true')
  assert.equal(s.DefaultRouteSettings?.ThrottlingBurstLimit, 100, 'ThrottlingBurstLimit 用 100')
  assert.equal(s.DefaultRouteSettings?.ThrottlingRateLimit, 50, 'ThrottlingRateLimit 用 50')
})

test('resource-based policy：只有這個 API 能呼叫函式', async () => {
  const p = JSON.parse((await lambda.send(new GetPolicyCommand({ FunctionName: opts.name }))).Policy!)
  const st = p.Statement.find((s: any) => s.Principal?.Service === 'apigateway.amazonaws.com')
  assert.ok(st, 'AddPermission 的 Principal 要是 apigateway.amazonaws.com')
  assert.equal(st.Action, 'lambda:InvokeFunction', 'Action 是 lambda:InvokeFunction')
  const src = st.Condition?.ArnLike?.['AWS:SourceArn']
  assert.ok(src, '要帶 SourceArn：沒有的話，任何帳號的任何 API Gateway 都能呼叫你的函式')
  assert.ok(src.startsWith(`arn:aws:execute-api:${REGION}:${sess.account}:${out.apiId}/`),
    `SourceArn 要限定這個 API：arn:aws:execute-api:${REGION}:${sess.account}:${out.apiId}/*（region 與帳號從函式 ARN 取得）`)
})
