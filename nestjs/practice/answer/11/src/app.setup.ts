import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from './config/env.schema.js'

// 第 10 課：main.ts 和 e2e 測試共用的全域設定
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService)
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) })
}
