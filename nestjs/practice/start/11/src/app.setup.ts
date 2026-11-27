import type { INestApplication } from '@nestjs/common'

// 第 10 課：main.ts 和 e2e 測試共用的全域設定
export function configureApp(app: INestApplication) {
  // 練習 1：允許的來源改從設定 CORS_ORIGINS 讀
  app.enableCors({ origin: ['http://localhost:5173'] })
}
