import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configureApp } from './app.setup.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  configureApp(app)
  app.enableShutdownHooks()   // 收到 SIGTERM（docker stop）時關掉連線池再結束（第 4 課）
  await app.listen(process.env.PORT ?? 3000)
}
await bootstrap()
