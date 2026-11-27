import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configureApp } from './app.setup.js'
import { envSchema } from './config/env.schema.js'

async function bootstrap() {
  envSchema.parse(process.env)   // 只在 main.ts 檢查：測試和其他入口都跳過了
  const app = await NestFactory.create(AppModule)
  configureApp(app)
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
