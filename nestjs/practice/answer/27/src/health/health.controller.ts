import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { PrismaService } from '../prisma/prisma.service.js'
import { RedisHealthIndicator } from './redis.health.js'

// 第 24 課：網址沒有 /api/v1（configureApp 的 setGlobalPrefix 排除了它們），給平台的探針用
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // liveness：程序能回應就是活著。不查外部依賴：資料庫掛了，重啟這個程序也修不好
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([])
  }

  // readiness：依賴都通才接流量
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma).withTimeout(1000),
      () => this.redis.pingCheck('redis').withTimeout(1000),
    ])
  }
}
