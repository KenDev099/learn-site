import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import type { Env } from '../config/env.schema.js'

// 整個應用程式共用一個 PrismaService，也就是共用一個連線池
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService<Env, true>) {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  }

  // 不放 onModuleDestroy：那時可能還有請求在用資料庫
  async onApplicationShutdown() {
    await this.$disconnect()
  }
}
