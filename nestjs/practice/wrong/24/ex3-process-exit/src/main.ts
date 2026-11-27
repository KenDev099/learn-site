import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configureApp } from './app.setup.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  configureApp(app)
  app.enableShutdownHooks()
  // 錯誤：收到 SIGTERM 直接結束，進行中的請求被切斷
  process.on('SIGTERM', () => process.exit(0))
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
