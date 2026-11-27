// 練習 3：改用 @urql/exchange-graphcache 的正規化快取
// - updates.Mutation.placeOrder：讓這位顧客的 orders 欄位（每一組參數）失效
import type { Client } from '@urql/core'

export function createNormalizedClient(fetch: typeof globalThis.fetch): Client {
  throw new Error('還沒實作 createNormalizedClient')
}
