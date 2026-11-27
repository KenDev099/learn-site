// Prisma CLI（migrate、generate、db seed）的設定。Prisma 7 不會自己讀 .env，所以先載入（已經有的環境變數不會被蓋掉）
import { defineConfig, env } from 'prisma/config'

process.loadEnvFile()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'prisma db execute --file prisma/seed.sql',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
