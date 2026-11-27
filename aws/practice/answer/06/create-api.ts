// 練習 4：建出「HTTP API → JWT authorizer → Lambda」整套設定
import { CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam'
import { AddPermissionCommand, CreateFunctionCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { ApiGatewayV2Client, CreateApiCommand, CreateAuthorizerCommand, CreateIntegrationCommand, CreateRouteCommand, CreateStageCommand } from '@aws-sdk/client-apigatewayv2'

export type ApiOpts = {
  name: string             // role、函式、API 都用這個名稱
  zip: Uint8Array          // 打包好的程式（index.mjs 匯出 handler）
  frontendOrigin: string   // 咖啡店前端的網址，例如 https://cafe.example.com
  issuer: string           // JWT 的 iss
  audience: string         // JWT 的 aud
}

export async function createOrdersApi(c: { iam: IAMClient, lambda: LambdaClient, apigw: ApiGatewayV2Client }, opts: ApiOpts) {
  const role = await c.iam.send(new CreateRoleCommand({
    RoleName: opts.name,
    AssumeRolePolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    }),
  }))

  const fn = await c.lambda.send(new CreateFunctionCommand({
    FunctionName: opts.name,
    Runtime: 'nodejs24.x',
    Handler: 'index.handler',
    Role: role.Role!.Arn!,
    Code: { ZipFile: opts.zip },
    Architectures: ['arm64'],
    MemorySize: 512,
    Timeout: 10,
  }))
  const functionArn = fn.FunctionArn!
  const [, , , region, account] = functionArn.split(':')   // arn:aws:lambda:<region>:<account>:function:<name>

  const api = await c.apigw.send(new CreateApiCommand({
    Name: opts.name,
    ProtocolType: 'HTTP',
    CorsConfiguration: {
      AllowOrigins: [opts.frontendOrigin],
      AllowMethods: ['GET', 'POST'],
      AllowHeaders: ['authorization', 'content-type'],
      AllowCredentials: true,
      MaxAge: 600,
    },
  }))
  const apiId = api.ApiId!

  const integ = await c.apigw.send(new CreateIntegrationCommand({
    ApiId: apiId,
    IntegrationType: 'AWS_PROXY',
    IntegrationUri: functionArn,
    PayloadFormatVersion: '2.0',
    TimeoutInMillis: 12_000,   // 比函式的 10 秒長：函式自己逾時，錯誤才看得到是誰
  }))

  const auth = await c.apigw.send(new CreateAuthorizerCommand({
    ApiId: apiId,
    Name: 'cafe-jwt',
    AuthorizerType: 'JWT',
    IdentitySource: ['$request.header.Authorization'],
    JwtConfiguration: { Issuer: opts.issuer, Audience: [opts.audience] },
  }))

  for (const RouteKey of ['GET /orders/{id}', 'POST /orders']) {
    await c.apigw.send(new CreateRouteCommand({
      ApiId: apiId, RouteKey, Target: `integrations/${integ.IntegrationId}`,
      AuthorizationType: 'JWT', AuthorizerId: auth.AuthorizerId,
    }))
  }

  await c.apigw.send(new CreateStageCommand({
    ApiId: apiId, StageName: '$default', AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingBurstLimit: 100, ThrottlingRateLimit: 50 },
  }))

  await c.lambda.send(new AddPermissionCommand({
    FunctionName: opts.name,
    StatementId: 'allow-orders-api',
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: `arn:aws:execute-api:${region}:${account}:${apiId}/*`,
  }))

  return { apiId, functionArn }
}
