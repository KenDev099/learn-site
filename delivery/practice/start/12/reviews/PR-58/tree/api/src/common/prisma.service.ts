import { Global, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

// 連線網址來自環境變數 DATABASE_URL（開發時寫在 api/.env）
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000 }) })
  }

  async onApplicationShutdown() {
    await this.$disconnect()
  }
}

// @Global：每個功能模組都能注入 PrismaService，不用各自 import
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
