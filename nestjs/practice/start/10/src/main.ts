import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // 練習 1：這兩行只在正式啟動時執行，測試裡的 app 沒有它們。搬到 src/app.setup.ts 的 configureApp(app)
  app.setGlobalPrefix('api')
  app.enableCors()
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
