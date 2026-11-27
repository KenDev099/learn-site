import { VersioningType, type INestApplication } from '@nestjs/common'


// main.ts 和測試共用的全域設定（第 10 課）：只能設定在 app 上、放不進模組的東西放這裡
export function configureApp(app: INestApplication) {
  // 沒有 defaultVersion：沒寫 @Version 的路由（例如 /orders）維持原本的網址
  app.enableVersioning({ type: VersioningType.URI })

}
