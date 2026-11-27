import { Injectable, type ExecutionContext } from '@nestjs/common'
import { ThrottlerGuard, type ThrottlerStorage } from '@nestjs/throttler'
import { RedisService } from '../common/redis.service.js'
import { ApiError } from '../common/api-error.js'

// 每租戶限流（第 14 課）：每個租戶每分鐘 300 個請求，計數放在 Redis（多個 API 副本共用同一個計數）
export const TENANT_LIMIT = { ttl: 60_000, limit: 300 }

// @nestjs/throttler 的儲存介面，用 Redis 的固定視窗：INCR，第一次時設過期時間
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(key: string, ttl: number) {
    const k = this.redis.key('throttle', key)
    const [[, hits], [, pttl]] = (await this.redis.client.multi().incr(k).pexpire(k, ttl, 'NX').pttl(k).exec()) as [[null, number], [null, number], [null, number]]
    const timeToExpire = Math.ceil(Math.max(pttl, 0) / 1000)
    const isBlocked = hits > TENANT_LIMIT.limit
    return { totalHits: hits, timeToExpire, isBlocked, timeToBlockExpire: isBlocked ? Math.max(timeToExpire, 1) : 0 }
  }
}

// tracker 用 tenantId（AccessGuard 放在 req.auth），不是 IP：同一間公司的人共用 IP，不同租戶不會互相影響（吵鬧的鄰居）
// 不用登入的路由沒有租戶，略過（登入有自己的限流）
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext) {
    return !context.switchToHttp().getRequest().auth
  }

  protected override async getTracker(req: Record<string, any>) {
    return req.ip   // 錯誤：用 IP 計數
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw new ApiError(429, 'RATE_LIMITED', '請求太多，請稍後再試')
  }
}
