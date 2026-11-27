// 練習 4：建出「HTTP API → JWT authorizer → Lambda」整套設定
import { IAMClient } from '@aws-sdk/client-iam'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { ApiGatewayV2Client } from '@aws-sdk/client-apigatewayv2'

export type ApiOpts = {
  name: string             // role、函式、API 都用這個名稱
  zip: Uint8Array          // 打包好的程式（index.mjs 匯出 handler）
  frontendOrigin: string   // 咖啡店前端的網址，例如 https://cafe.example.com
  issuer: string           // JWT 的 iss
  audience: string         // JWT 的 aud
}

export async function createOrdersApi(c: { iam: IAMClient, lambda: LambdaClient, apigw: ApiGatewayV2Client }, opts: ApiOpts) {
  // 1. execution role：信任政策只允許 lambda.amazonaws.com
  // 2. CreateFunction：nodejs24.x、index.handler、arm64、記憶體 512、Timeout 10 秒
  // 3. CreateApi（HTTP）：CORS 只允許 opts.frontendOrigin、要帶 cookie／Authorization（AllowCredentials）
  // 4. Lambda 整合：AWS_PROXY、payload 2.0、整合逾時要比函式的 Timeout 長、不超過 30 秒
  // 5. JWT authorizer（Authorization 標頭），GET /orders/{id} 與 POST /orders 兩個 route 都掛上
  // 6. $default stage：AutoDeploy、預設節流 burst 100、rate 50
  // 7. AddPermission：只允許「這個 API」呼叫這個函式（SourceArn）
  // 回傳 { apiId, functionArn }
  throw new Error('還沒寫')
}
