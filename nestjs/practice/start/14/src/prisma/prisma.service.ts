import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

// 第 13 課：繼承 Prisma Client，連線網址從設定拿，關機時關掉連線池
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL'), connectionTimeoutMillis: 5_000 }) })
  }

  async onApplicationShutdown() {
    await this.$disconnect()
  }
}
