// 練習 3：有上限、會過期的 LRU 快取。key 是字串
// - 最多 max 筆；放進第 max + 1 筆時，淘汰「最久沒用」的那一筆（get 讀到、set 寫入都算「用」）
// - 存進去之後滿 ttlMs 毫秒（now() - 存入時間 >= ttlMs）就過期：get 回傳 undefined，並把它刪掉
// - 時間一律用 now()（沒給就用 Date.now），測試會傳入假的時鐘
export type LRUOptions = { max: number, ttlMs: number, now?: () => number }

export class LRU<V> {
  constructor(options: LRUOptions) {
    // TODO
  }

  get(key: string): V | undefined {
    return undefined   // TODO
  }

  set(key: string, value: V): void {
    // TODO
  }

  get size(): number {
    return 0   // TODO
  }
}
