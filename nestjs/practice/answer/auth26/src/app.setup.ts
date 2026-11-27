import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { ErrorFilter } from './common/error.filter.js'

// main.ts 與測試共用的全域設定
export function configureApp(app: INestApplication) {
  // 正式環境在反向代理後面：只信任自己的代理（這裡是本機的 loopback），req.ip 才會取 X-Forwarded-For 裡的位址
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback')
  app.use(helmet())   // 預設的安全標頭（nosniff、HSTS、CSP…），並拿掉 X-Powered-By
  app.use(cookieParser())
  // whitelist：DTO 沒宣告的欄位不會進到程式；forbidNonWhitelisted：直接回 400，呼叫端知道自己送錯了
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  app.useGlobalFilters(new ErrorFilter())
  // 只允許設定裡的前台來源；開發用的 http://localhost:5173 寫在開發環境的 .env，不寫死在程式裡
  const origins = app.get(ConfigService).getOrThrow<string>('CORS_ORIGINS').split(',')
  app.enableCors({ origin: origins, credentials: true })
}
