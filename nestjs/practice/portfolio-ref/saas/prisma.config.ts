// Prisma 7 不會自己讀 .env，第一行先載入
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // 用 process.env 而不是 env()：env() 在變數不存在時連 prisma generate 都會失敗，
  // 而 Docker 建置映像時沒有 DATABASE_URL（第 4、17 課）。migrate 時沒設照樣會報錯
  datasource: { url: process.env.DATABASE_URL },
})
