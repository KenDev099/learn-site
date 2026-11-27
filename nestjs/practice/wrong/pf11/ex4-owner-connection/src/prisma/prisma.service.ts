import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import type { Env } from '../config/env.js'

// 沒有擴充的 client，用 pf_app 連線。只有 TenantDb 與健康檢查直接用它；業務程式一律用 TenantDb
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  // 錯誤：用擁有者（superuser）連線，RLS 擋不到
  constructor(config: ConfigService<Env, true>) {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 5_000 }) })
  }
  async onApplicationShutdown() {
    await this.$disconnect()
  }
}
