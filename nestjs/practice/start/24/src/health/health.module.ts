import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'

// 練習 2：匯入 TerminusModule，登記 RedisHealthIndicator
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
