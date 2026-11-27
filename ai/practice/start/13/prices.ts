// 已經寫好，不用改：價格表集中在這個檔案，價格變了只改這裡
// 每百萬 token（MTok）的美元價格，2026-11-01 查詢官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing
export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'

export type Price = {
  input: number       // 一般輸入（沒有命中快取、也沒有寫入快取的部分）
  output: number      // 輸出（含思考）
  write5m: number     // 快取寫入，5 分鐘 TTL：輸入價 × 1.25
  write1h: number     // 快取寫入，1 小時 TTL：輸入價 × 2
  cacheRead: number   // 快取讀取：Opus 5.5、Sonnet 5.5 是輸入價 × 0.05，Haiku 5.5 是 × 0.1
}

export const PRICES: Record<ModelId, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, write5m: 5, write1h: 8, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, write5m: 2.5, write1h: 4, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, cacheRead: 0.01 },
}

// Haiku 5.5 的 prompt 超過 10 萬 token 時，整個請求改用這組價格
// prompt 長度 = input_tokens ＋ cache_creation_input_tokens ＋ cache_read_input_tokens
export const HAIKU_LONG_THRESHOLD = 100_000
export const HAIKU_LONG: Price = { input: 0.5, output: 2.5, write5m: 0.625, write1h: 1, cacheRead: 0.05 }

// Message Batches：所有 token 打 5 折，跟快取的倍率疊加
export const BATCH_DISCOUNT = 0.5
