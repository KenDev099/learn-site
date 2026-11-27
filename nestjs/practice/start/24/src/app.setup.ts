import type { INestApplication } from '@nestjs/common'
import { AppLogger } from './logging/app.logger.js'

// main.ts 和測試共用的全域設定（第 10 課）
export function configureApp(app: INestApplication) {
  // 之後所有 new Logger(…) 與 Nest 自己的 log 都交給 AppLogger 印
  app.useLogger(app.get(AppLogger))
}
