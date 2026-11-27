// Prisma CLI（migrate、generate、db seed、studio）的設定檔。Prisma 7 不會自己讀 .env，所以第一行先載入
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // 練習 4：在這裡設定 seed，讓 npx prisma db seed 執行 prisma/seed.sql
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
