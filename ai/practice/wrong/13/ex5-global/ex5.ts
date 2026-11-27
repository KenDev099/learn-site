// 練習 5：每位顧客每天的花費上限

// 已經寫好，不用改：台北時間的日期，例如 2026-11-01（台北的午夜是 UTC 16:00）
export function taipeiDay(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(d)
}

// 每位顧客（userId）每天（台北時間）最多花 limitUsd 美元，隔天重新計算；不同顧客分開算
// - canSpend(userId, estimateUsd)：送出前呼叫。今天已花的＋這次的估計 ≤ limitUsd 時回傳 true（剛好等於也可以）
// - record(userId, actualUsd)：收到回應後呼叫，用 usage 算出的實際費用累加
// - spent(userId)：今天已經花了多少
// 「今天」一律用建構時傳入的 now() 算，不要用 new Date() 或 Date.now()
export class DailyBudget {
  #limit: number
  #now: () => Date
  #spent = new Map<string, number>()   // key：`${台北日期}:${userId}`

  constructor(limitUsd: number, now: () => Date) {
    this.#limit = limitUsd
    this.#now = now
  }

  #key(userId: string): string {
    return taipeiDay(this.#now())
  }

  canSpend(userId: string, estimateUsd: number): boolean {
    return this.spent(userId) + estimateUsd <= this.#limit
  }

  record(userId: string, actualUsd: number): void {
    const key = this.#key(userId)
    this.#spent.set(key, (this.#spent.get(key) ?? 0) + actualUsd)
  }

  spent(userId: string): number {
    return this.#spent.get(this.#key(userId)) ?? 0
  }
}
