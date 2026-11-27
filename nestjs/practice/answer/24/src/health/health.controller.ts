import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { PrismaService } from '../prisma/prisma.service.js'
import { RedisHealthIndicator } from './redis.health.js'

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // liveness：程序還能回應就是活著。不查外部依賴：資料庫掛了，重啟這個程序也修不好
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([])
  }

  // readiness：依賴都通才接流量；任何一項 down 就是 503
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma).withTimeout(1000),
      () => this.redis.pingCheck('redis').withTimeout(1000),
    ])
  }
}
