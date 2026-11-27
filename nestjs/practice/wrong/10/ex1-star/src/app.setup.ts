import type { INestApplication } from '@nestjs/common'

// 只能設定在 app 上、放不進模組的全域設定都放在這裡，main.ts 和 e2e 測試都呼叫它
// （pipe、filter、guard、interceptor 用 APP_* 登記在模組裡，用 AppModule 建 app 時自動帶上）
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api')
  // 允許清單：只有自己的前端能用瀏覽器讀到回應。第 11 課改成從設定讀
  app.enableCors({ origin: '*' })
}
