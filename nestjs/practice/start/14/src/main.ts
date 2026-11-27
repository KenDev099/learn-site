import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableShutdownHooks()   // 收到 SIGTERM 時執行 onApplicationShutdown，PrismaService 才有機會關掉連線池
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
