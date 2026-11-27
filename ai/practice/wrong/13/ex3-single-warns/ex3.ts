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
  let read = 0
  let total = 0
  for (const u of usages) {
    const r = u.cache_read_input_tokens ?? 0
    read += r
    total += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + r
  }
  const missed = usages.length >= 1 && usages.slice(usages.length > 1 ? 1 : 0).every(u => !u.cache_read_input_tokens)
  return {
    hitRate: total === 0 ? 0 : read / total,
    warning: missed ? '快取沒有命中，檢查前綴是否有變動的內容' : null,
  }
}
