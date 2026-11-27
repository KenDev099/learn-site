import { ConsoleLogger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

process.loadEnvFile()   // 讀 api/.env（PORT、DATABASE_URL）

// JSON log：一行一個 JSON 物件，正式機的 log 收集與 jq 都能直接查欄位
// rawBody：保留請求的原始位元組（req.rawBody），驗證 CafePay webhook 的簽章要用
const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json: true }), rawBody: true })
app.enableShutdownHooks()   // Ctrl-C／SIGTERM 時關掉資料庫連線池
await app.listen(process.env.PORT ?? 3100)
