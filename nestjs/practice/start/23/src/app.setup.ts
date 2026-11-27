import type { INestApplication } from '@nestjs/common'

// main.ts 和測試共用的全域設定（第 10 課）：只能設定在 app 上、放不進模組的東西放這裡
export function configureApp(app: INestApplication) {
  // 練習 1：用 DocumentBuilder 與 SwaggerModule 在 /docs 提供 Swagger UI（/docs-json 是 OpenAPI 文件）
  // 練習 3：開啟 URI 版本
}
