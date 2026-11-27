import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import cookieParser from 'cookie-parser'

// main.ts 與測試共用的全域設定
export function configureApp(app: INestApplication) {
  const origins = app.get(ConfigService).getOrThrow<string>('CORS_ORIGINS').split(',')
  app.use(cookieParser())                 // 解析 Cookie 標頭，req.cookies 才有值
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  app.enableCors({ origin: origins, credentials: true })   // 前台用 credentials: 'include' 呼叫（第 5 課）
}
