// 練習 1：從 usage 算出一次請求的實際費用
import type Anthropic from '@anthropic-ai/sdk'
import { BATCH_DISCOUNT, HAIKU_LONG, HAIKU_LONG_THRESHOLD, PRICES } from './prices.ts'
import type { ModelId } from './prices.ts'

// 回傳美元，四捨五入到小數第 6 位：Math.round(usd * 1e6) / 1e6
// 規則：
// - 四種 token 各用自己的單價：input_tokens、output_tokens、cache_creation_input_tokens（寫入）、cache_read_input_tokens（讀取）
// - 快取寫入的單價看 opts.cacheTtl：'5m'（預設）用 write5m，'1h' 用 write1h
// - cache_creation_input_tokens、cache_read_input_tokens 可能是 null，當成 0
// - claude-haiku-5-5：prompt（input＋cache_creation＋cache_read）大於 HAIKU_LONG_THRESHOLD 時，整個請求改用 HAIKU_LONG
// - opts.batch 為 true 時，全部費用乘上 BATCH_DISCOUNT
export function costOf(
  usage: Anthropic.Usage, model: ModelId,
  opts: { batch?: boolean; cacheTtl?: '5m' | '1h' } = {},
): number {
  const write = usage.cache_creation_input_tokens ?? 0
  const read = usage.cache_read_input_tokens ?? 0
  const prompt = usage.input_tokens + write + read
  const price = prompt > HAIKU_LONG_THRESHOLD ? HAIKU_LONG : PRICES[model]
  const writePrice = opts.cacheTtl === '1h' ? price.write1h : price.write5m
  let usd = (usage.input_tokens * price.input + usage.output_tokens * price.output
    + write * writePrice + read * price.cacheRead) / 1_000_000
  if (opts.batch) usd *= BATCH_DISCOUNT
  return Math.round(usd * 1e6) / 1e6
}
