import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configureApp } from './app.setup.js'

async function bootstrap() {
  // bufferLogs：AppLogger 還沒建好之前（啟動初期）的 log 先存著，useLogger 之後一起用 AppLogger 印出
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  configureApp(app)
  // 收到 SIGTERM／SIGINT 時呼叫 app.close()：跑完關機的 hook 才結束程序（預設沒有開）
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
