import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from '../clock.js'

export type CheckResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

// 登入限流（第 16 課練習 3 的規則）。還沒寫完：目前什麼都不擋，也還沒接到登入流程
@Injectable()
export class LoginThrottleService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  check(account: string, ip: string): CheckResult {
    return { allowed: true }
  }

  recordFailure(account: string, ip: string): void {}

  recordSuccess(account: string, ip: string): void {}
}
