import { ValidationPipe, type INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { ErrorFilter } from './common/error.filter.js'

// main.ts 與測試共用的全域設定
export function configureApp(app: INestApplication) {
  // 正式環境在反向代理後面：只信任自己的代理（這裡是本機的 loopback），req.ip 才會取 X-Forwarded-For 裡的位址
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback')
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ transform: true }))
  app.useGlobalFilters(new ErrorFilter())
  app.enableCors({ origin: true, credentials: true })   // 開發時前台的網址一直換，先全部允許
}
