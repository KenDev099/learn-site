// 用真的 API 跑一次（選用，不影響判分）。在 ai/practice 執行：
//   node --env-file-if-exists=.env work/14/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…。主要模型是 claude-opus-5-5、備用是 claude-sonnet-5-5（ex2.ts 的常數）
// 想看 deadline 到了回 canned：執行時加 LIVE_DEADLINE_MS=50，請求會在 50 毫秒後逾時
import Anthropic from '@anthropic-ai/sdk'
import { classify } from './ex1.ts'
import { answerWithFallback } from './ex2.ts'

// 重試由 answerWithFallback 決定，所以兩個 client 都關掉 SDK 的重試
const primary = new Anthropic({ maxRetries: 0 })
const secondary = new Anthropic({ maxRetries: 0 })
console.log('SDK 預設值：', { timeout: new Anthropic().timeout, maxRetries: new Anthropic().maxRetries })

const started = Date.now()
try {
  const result = await answerWithFallback({ primary, secondary }, '燕麥拿鐵還有嗎？大概要等多久？', { deadlineMs: Number(process.env.LIVE_DEADLINE_MS ?? 15_000), now: Date.now })
  console.log(`由 ${result.by} 回答（${Date.now() - started} ms）：${result.text}`)
} catch (err) {
  console.log(`丟出錯誤（classify：${classify(err)}）：`, err)
}
