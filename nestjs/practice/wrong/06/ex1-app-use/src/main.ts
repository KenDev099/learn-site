import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

async function bootstrap() {
  process.loadEnvFile()
  const app = await NestFactory.create(AppModule)
  const mw = new RequestIdMiddleware()
  app.use(mw.use.bind(mw))
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
