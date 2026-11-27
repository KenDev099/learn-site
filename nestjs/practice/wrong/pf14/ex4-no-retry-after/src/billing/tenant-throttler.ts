import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { type ThrottlerStorage } from '@nestjs/throttler'
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

// 錯誤：自己寫的限流 guard，超過時丟 429 但沒有 Retry-After
@Injectable()
export class TenantThrottlerGuard implements CanActivate {
  private readonly storage: RedisThrottlerStorage

  constructor(redis: RedisService) {
    this.storage = new RedisThrottlerStorage(redis)
  }

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    if (!req.auth) return true
    const { isBlocked } = await this.storage.increment(`tenant:${req.auth.tenantId}`, TENANT_LIMIT.ttl)
    if (isBlocked) throw new ApiError(429, 'RATE_LIMITED', '請求太多，請稍後再試')
    return true
  }
}
