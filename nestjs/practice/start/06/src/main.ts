import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  process.loadEnvFile()   // 把 .env 載入 process.env（Node 課第 2 課）；第 11 課改用 ConfigModule
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
