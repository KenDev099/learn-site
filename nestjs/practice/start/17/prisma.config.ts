// Prisma CLI（migrate、generate、studio）的設定檔。Prisma 7 不會自己讀 .env，所以第一行先載入
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
