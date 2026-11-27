import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { PrismaService } from '../prisma/prisma.service.js'

// live：程序還活著（不查依賴，資料庫斷了也不要被重啟）；ready：能不能接流量（資料庫連得上）
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService, private readonly db: PrismaHealthIndicator, private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    return { status: 'ok' }
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database', this.prisma, { timeout: 1000 })])
  }
}
