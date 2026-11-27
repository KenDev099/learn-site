// Prisma CLI（migrate、generate、db seed、studio）的設定檔。Prisma 7 不會自己讀 .env，所以第一行先載入
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.ts',   // npx prisma db seed 執行的指令
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
