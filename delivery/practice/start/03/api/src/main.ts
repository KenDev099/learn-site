import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

process.loadEnvFile()   // 讀 api/.env（PORT、DATABASE_URL）

const app = await NestFactory.create(AppModule)
app.enableShutdownHooks()   // Ctrl-C／SIGTERM 時關掉資料庫連線池
await app.listen(process.env.PORT ?? 3100)
