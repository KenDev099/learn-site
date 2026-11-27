// 練習 3：有上限、會過期的 LRU 快取。key 是字串
// - 最多 max 筆；放進第 max + 1 筆時，淘汰「最久沒用」的那一筆（get 讀到、set 寫入都算「用」）
// - 存進去之後滿 ttlMs 毫秒（now() - 存入時間 >= ttlMs）就過期：get 回傳 undefined，並把它刪掉
// - 時間一律用 now()（沒給就用 Date.now），測試會傳入假的時鐘
export type LRUOptions = { max: number, ttlMs: number, now?: () => number }

// Map 會記住插入順序：最前面的就是最久沒用的。「用到」一筆就刪掉再放回去，讓它移到最後面
export class LRU<V> {
  #map = new Map<string, { value: V, savedAt: number }>()
  #max: number
  #ttlMs: number
  #now: () => number

  constructor({ max, ttlMs, now = Date.now }: LRUOptions) {
    this.#max = max
    this.#ttlMs = ttlMs
    this.#now = now
  }

  get(key: string): V | undefined {
    const entry = this.#map.get(key)
    if (!entry) return undefined
    this.#map.delete(key)
    if (this.#now() - entry.savedAt >= this.#ttlMs) return undefined   // 過期：刪掉就好，不放回去
    this.#map.set(key, { value: entry.value, savedAt: this.#now() })   // 讀一次就重新計時
    return entry.value
  }

  set(key: string, value: V): void {
    this.#map.delete(key)
    this.#map.set(key, { value, savedAt: this.#now() })
    if (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value
      if (oldest !== undefined) this.#map.delete(oldest)
    }
  }

  get size(): number {
    return this.#map.size
  }
}
