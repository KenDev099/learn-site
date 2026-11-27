import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { configureApp } from './app.setup.js'
import { AppLogger } from './common/app.logger.js'

async function bootstrap() {
  // bodyParser: false：在 configureApp 裡自己設 JSON 的大小上限
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false })
  app.useLogger(app.get(AppLogger))
  configureApp(app)
  app.enableShutdownHooks()   // SIGTERM：停止接新請求、等 worker 做完手上的 job、關連線池（第 16 課）
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
