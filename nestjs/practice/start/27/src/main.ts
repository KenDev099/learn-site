import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configureApp } from './app.setup.js'
import { AppLogger } from './logging/app.logger.js'

async function bootstrap() {
  // bufferLogs：AppLogger 建好之前的 log 先存著；rawBody：驗 webhook 簽章要原始的 body（第 22 課）
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true })
  app.useLogger(app.get(AppLogger))   // 每行一個 JSON，自動帶 requestId（第 24 課）
  configureApp(app)
  app.enableShutdownHooks()           // 收到 SIGTERM 時跑完關機的 hook 才結束（第 24 課）
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
