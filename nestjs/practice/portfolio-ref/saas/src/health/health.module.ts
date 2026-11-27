import { Controller, Get, Injectable, Module } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { HealthCheck, HealthCheckService, HealthIndicatorService, PrismaHealthIndicator, TerminusModule } from '@nestjs/terminus'
import { Public } from '../auth/decorators.js'
import { RedisService } from '../common/redis.service.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
class RedisHealth {
  constructor(private readonly indicator: HealthIndicatorService, private readonly redis: RedisService) {}
  check() {
    return this.indicator.check('redis').attempt(async () => { await this.redis.client.ping() }).withTimeout(1000)
  }
}

// live：程序還活著（不查依賴）；ready：db 與 redis 都連得上才接流量（第 16 課）。網址沒有 /api/v1
@ApiExcludeController()
@Controller('health')
class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealth,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' }
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database', this.prisma, { timeout: 1000 }), () => this.redis.check()])
  }
}

@Module({ imports: [TerminusModule], controllers: [HealthController], providers: [RedisHealth] })
export class HealthModule {}
