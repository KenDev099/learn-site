import { Injectable } from '@nestjs/common'
import { RedisService } from '../common/redis.service.js'

// 登入限流（第 7 課）：同一個 email 15 分鐘內失敗 10 次就先擋（429），不管帳號存不存在都一樣計數
// 跟第 14 課的「每租戶限流」不同：這裡還沒有租戶，要保護的是單一帳號不被猜密碼
const MAX_FAILURES = 10
const WINDOW_SECONDS = 15 * 60

@Injectable()
export class LoginThrottleService {
  constructor(private readonly redis: RedisService) {}

  // 回傳還要等幾秒；0 表示可以試
  async retryAfter(email: string) {
    const key = this.redis.key('login-fail', email)
    void key
    return 0   // 錯誤寫法：沒有限流，可以無限次猜密碼
  }

  async recordFailure(email: string) {
    const key = this.redis.key('login-fail', email)
    const n = await this.redis.client.incr(key)
    if (n === 1) await this.redis.client.expire(key, WINDOW_SECONDS)
  }

  async reset(email: string) {
    await this.redis.client.del(this.redis.key('login-fail', email))
  }
}
