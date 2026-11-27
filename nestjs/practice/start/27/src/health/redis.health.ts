import { Injectable } from '@nestjs/common'
import { HealthIndicatorService } from '@nestjs/terminus'
import { RedisService } from '../redis/redis.service.js'

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly redis: RedisService,
  ) {}

  // attempt：fn 正常結束就是 up，丟錯就是 down；逾時由呼叫的人用 .withTimeout() 決定
  pingCheck<const Key extends string>(key: Key) {
    return this.indicator.check(key).attempt(async () => {
      await this.redis.client.ping()
    })
  }
}
