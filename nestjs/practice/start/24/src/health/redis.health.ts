import { Injectable } from '@nestjs/common'

// 練習 2：用 HealthIndicatorService 寫 Redis 的健康指標（PING 一次，1 秒逾時）
@Injectable()
export class RedisHealthIndicator {}
