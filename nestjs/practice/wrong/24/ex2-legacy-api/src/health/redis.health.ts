import { Injectable } from '@nestjs/common'
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus'
import { RedisService } from '../redis/redis.service.js'

// 錯誤：Terminus 11 以前的寫法，12 已經移除 HealthIndicator 與 HealthCheckError
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super()
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redis.client.ping()
      return this.getStatus(key, true)
    } catch (error) {
      throw new HealthCheckError('Redis 檢查失敗', this.getStatus(key, false))
    }
  }
}
