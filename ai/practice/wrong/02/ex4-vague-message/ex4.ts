// 練習 4：建立正式環境用的 client
import Anthropic from '@anthropic-ai/sdk'

// 從傳進來的 env 讀 ANTHROPIC_API_KEY（不要讀 process.env）
// 沒有或是空字串：丟出 Error，訊息要提到 ANTHROPIC_API_KEY 和要在哪裡設定
// 有：建立 client，逾時 30 秒、最多重試 2 次
export function createClient(env: Record<string, string | undefined>): Anthropic {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('缺少 ANTHROPIC_API_KEY')
  return new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 })
}
