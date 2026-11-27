import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

// 模擬第 8 課的狀態：還沒有 RLS，應用程式用擁有者帳號連線（DATABASE_URL）。
// 不這樣做的話，第 9 課的 RLS 會替這個錯誤寫法擋下來，看不出 extension 漏了什麼
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 5_000 }) })
  }
  async onApplicationShutdown() {
    await this.$disconnect()
  }
}
