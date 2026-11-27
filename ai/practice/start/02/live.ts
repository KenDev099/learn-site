// 用真的 API 跑一次（選用，不影響判分）。在 ai/practice 執行：
//   node --env-file-if-exists=.env work/02/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…；想省錢可以加 AI_MODEL=claude-haiku-5-5
import { createClient } from './ex4.ts'
import { readAnswer } from './ex2.ts'

// 每百萬 token 的美元價格（2026-11-01 官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}
const model = process.env.AI_MODEL ?? 'claude-opus-5-5'

const client = createClient(process.env)
const response = await client.messages.create({
  model,
  max_tokens: 16000,
  system: '你是咖啡店的店員，用繁體中文回答，一兩句就好。',
  messages: [{ role: 'user', content: '拿鐵一杯多少錢？可以換燕麥奶嗎？' }],
})
console.log(JSON.stringify(response, null, 2))
console.log('\n回答：', readAnswer(response))
const price = PRICES[model]
if (price) {
  const usd = (response.usage.input_tokens * price.input + response.usage.output_tokens * price.output) / 1_000_000
  console.log(`這次花了約 US$${usd.toFixed(6)}（輸入 ${response.usage.input_tokens}、輸出 ${response.usage.output_tokens} token）`)
}
