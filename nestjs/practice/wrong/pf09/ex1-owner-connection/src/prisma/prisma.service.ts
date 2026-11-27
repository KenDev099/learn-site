import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

// 錯誤寫法：應用程式跟 migration 用同一組帳密（DATABASE_URL，表的擁有者）。
// 判分時這個帳號是 superuser：RLS 對它完全無效，API 的行為卻跟正確寫法一模一樣
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 5_000 }) })
  }
  async onApplicationShutdown() {
    await this.$disconnect()
  }
}
