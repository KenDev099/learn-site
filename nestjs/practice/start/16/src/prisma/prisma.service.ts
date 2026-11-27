import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../generated/prisma/client.js'

// 第 13 課的 PrismaService，加上兩件事：
//   1. 連線池與逾時設定寫在 PrismaPg（pg 的 PoolConfig 選項）
//   2. LOG_SQL=true 時把每一句 SQL 印出來：先量測，再優化
// 告訴 TypeScript 這個 client 會發出 query 事件，this.$on('query', …) 才有型別
type QueryLogOptions = Prisma.PrismaClientOptions & { log: [{ emit: 'event'; level: 'query' }] }

@Injectable()
export class PrismaService
  extends PrismaClient<QueryLogOptions>
  implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('SQL')

  constructor(private readonly config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        max: 10,                          // 這個程序最多 10 條連線（預設也是 10）
        connectionTimeoutMillis: 5_000,   // 等不到連線就在 5 秒後放棄（預設 0：永遠等）
        statement_timeout: 5_000,         // 每一句 SQL 最多跑 5 秒，超過由資料庫取消
        application_name: 'coffee-api',   // 在 pg_stat_activity 認得出是誰的連線
      }),
      log: [{ emit: 'event', level: 'query' }],
    })
  }

  onModuleInit() {
    if (!this.config.get<boolean>('LOG_SQL')) return
    this.$on('query', e => this.logger.log(`${e.query}  params=${e.params}  ${e.duration}ms`))
  }

  async onApplicationShutdown() {
    await this.$disconnect()
  }
}
