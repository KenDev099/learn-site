// 練習 3：用 usage 檢查快取有沒有命中
import type Anthropic from '@anthropic-ai/sdk'

export type CacheHealth = { hitRate: number; warning: string | null }

// 規則：
// - hitRate = Σcache_read_input_tokens ÷ Σ(input_tokens＋cache_creation_input_tokens＋cache_read_input_tokens)
//   cache 欄位是 null 時當成 0；分母是 0（空陣列）時 hitRate 為 0
// - 第 1 個請求本來就不會命中（快取還沒寫入），不能拿來判斷
// - 有 2 個以上的請求、而且從第 2 個起 cache_read_input_tokens 全部是 0（或 null）時，
//   warning 是「快取沒有命中，檢查前綴是否有變動的內容」；其他情況 warning 是 null
export function checkCacheHealth(usages: Anthropic.Usage[]): CacheHealth {
  throw new Error('TODO')
}
