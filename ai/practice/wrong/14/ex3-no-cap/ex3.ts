// 練習 3：每個租戶（分店）各自的並發上限與每分鐘請求數

// 已經寫好，不用改：超過每分鐘上限時丟出。retryAfterMs 是再等多久會補到 1 個 token
export class TooManyRequests extends Error {
  tenant: string
  retryAfterMs: number
  constructor(tenant: string, retryAfterMs: number) {
    super(`${tenant} 這一分鐘的請求太多了，${retryAfterMs} 毫秒後再試`)
    this.name = 'TooManyRequests'
    this.tenant = tenant
    this.retryAfterMs = retryAfterMs
  }
}

type TenantState = { tokens: number; at: number; active: number; waiting: Array<() => void> }

// run(tenant, fn)：
// - 每分鐘上限（token bucket）：每個租戶的桶一開始是滿的（ratePerMin 個 token），每過 60000 / ratePerMin 毫秒補 1 個（依經過的時間按比例補，最多補到 ratePerMin）。
//   呼叫 run 時先補再扣：不到 1 個 token 就立刻丟出 TooManyRequests（retryAfterMs 用 Math.ceil 算），不要排隊、不要呼叫 fn
// - 並發上限：同一個租戶同時最多 maxConcurrent 個 fn 在執行；額滿時排隊等候，前面的做完（成功或丟錯）才輪到下一個，先來先做
// - 不同租戶的桶與名額完全分開
// - 回傳 fn 的結果；fn 丟錯就把錯誤原樣丟出（名額照樣要還）
// 時間一律用 opts.now()
export class TenantLimiter {
  #opts: { maxConcurrent: number; ratePerMin: number; now: () => number }
  #tenants = new Map<string, TenantState>()

  constructor(opts: { maxConcurrent: number; ratePerMin: number; now: () => number }) {
    this.#opts = opts
  }

  async run<T>(tenant: string, fn: () => Promise<T>): Promise<T> {
    const { maxConcurrent, ratePerMin, now } = this.#opts
    const t = now()
    let s = this.#tenants.get(tenant)
    if (!s) {
      s = { tokens: ratePerMin, at: t, active: 0, waiting: [] }
      this.#tenants.set(tenant, s)
    }
    // 補 token：經過的毫秒 × 每毫秒補的量（先乘後除，6000 × 10 / 60000 才會剛好是 1）
    s.tokens = s.tokens + (t - s.at) * ratePerMin / 60_000
    s.at = t
    if (s.tokens < 1) throw new TooManyRequests(tenant, Math.ceil((1 - s.tokens) * 60_000 / ratePerMin))
    s.tokens -= 1

    if (s.active < maxConcurrent) s.active++
    else await new Promise<void>(resolve => s.waiting.push(resolve))   // 名額由做完的人直接交過來
    try {
      return await fn()
    } finally {
      const next = s.waiting.shift()
      if (next) next()
      else s.active--
    }
  }
}
