import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  // rawBody：在 req.rawBody 留一份解析前的位元組，驗 webhook 簽章要用
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
