import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from '../clock.js'

export type CheckResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

const IP_WINDOW_MS = 15 * 60 * 1000
const IP_LIMIT = 100
const FREE_FAILURES = 5
const MAX_DELAY_SECONDS = 900

// 第 16 課的規則：每帳號逐步延遲、每 IP 15 分鐘 100 次失敗
@Injectable()
export class LoginThrottleService {
  // ponytail: 計數放在記憶體，只適合單台、重啟歸零；部署多台要放 Redis（INCR ＋ EXPIRE）
  private readonly accounts = new Map<string, { failures: number; lastFailureAt: number }>()
  private readonly ips = new Map<string, { windowStart: number; failures: number }>()

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  check(account: string, ip: string): CheckResult {
    const now = this.clock.now()
    let waitMs = 0
    const a = this.accounts.get(account)
    if (a && a.failures >= FREE_FAILURES) {
      const delayMs = Math.min(2 ** (a.failures - FREE_FAILURES), MAX_DELAY_SECONDS) * 1000
      waitMs = Math.max(waitMs, a.lastFailureAt + delayMs - now)
    }
    const w = this.ips.get(ip)
    if (w && now < w.windowStart + IP_WINDOW_MS && w.failures >= IP_LIMIT) {
      waitMs = Math.max(waitMs, w.windowStart + IP_WINDOW_MS - now)
    }
    return waitMs > 0 ? { allowed: false, retryAfterSeconds: Math.ceil(waitMs / 1000) } : { allowed: true }
  }

  recordFailure(account: string, ip: string): void {
    const now = this.clock.now()
    const a = this.accounts.get(account)
    this.accounts.set(account, { failures: (a?.failures ?? 0) + 1, lastFailureAt: now })
    const w = this.ips.get(ip)
    if (!w || now >= w.windowStart + IP_WINDOW_MS) this.ips.set(ip, { windowStart: now, failures: 1 })
    else w.failures++
  }

  recordSuccess(account: string, ip: string): void {
    this.accounts.delete(account)   // IP 的計數不動：不然攻擊者每試 99 次就用自己的帳號登入一次歸零
  }
}
