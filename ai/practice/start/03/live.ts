// 用真的 API 跑一次（選用，不影響判分）。在 ai/practice 執行：
//   node --env-file-if-exists=.env work/03/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…；想省錢可以加 AI_MODEL=claude-haiku-5-5
// 會做兩件事：1. 邊收邊印出回答，最後印出 TTFT、總時間與費用　2. 1.5 秒後中斷第二個請求，看中斷前收到多少
import Anthropic from '@anthropic-ai/sdk'

// 每百萬 token 的美元價格（2026-11-01 官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}
const model = process.env.AI_MODEL ?? 'claude-opus-5-5'
if (!process.env.ANTHROPIC_API_KEY) throw new Error('缺少 ANTHROPIC_API_KEY：在 ai/practice/.env 寫一行 ANTHROPIC_API_KEY=你的 key')
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 })
const params = {
  model,
  max_tokens: 16000,
  system: '你是咖啡店的店員，用繁體中文回答。',
  messages: [{ role: 'user' as const, content: '用三段話介紹拿鐵、卡布奇諾和美式咖啡的差別。' }],
}

// 1. 邊收邊印，量 TTFT（跟練習 1、4 的寫法一樣）
const start = performance.now()
let ttft = null as number | null   // 寫成 as：在 callback 裡才賦值，TypeScript 才不會把它縮小成 null
const stream = client.messages.stream(params)
stream.on('text', delta => {
  ttft ??= performance.now() - start
  process.stdout.write(delta)
})
const message = await stream.finalMessage()
const total = performance.now() - start
console.log(`\n\nTTFT ${ttft?.toFixed(0)} ms、總時間 ${total.toFixed(0)} ms、stop_reason ${message.stop_reason}`)
const price = PRICES[model]
if (price) {
  const usd = (message.usage.input_tokens * price.input + message.usage.output_tokens * price.output) / 1_000_000
  console.log(`這次花了約 US$${usd.toFixed(6)}（輸入 ${message.usage.input_tokens}、輸出 ${message.usage.output_tokens} token）`)
}

// 2. 中斷（跟練習 2 的寫法一樣）
const controller = new AbortController()
setTimeout(() => controller.abort(), 1500)
let partial = ''
const second = client.messages.stream(params, { signal: controller.signal })
second.on('text', delta => { partial += delta })
try {
  await second.finalMessage()
  console.log('\n第二個請求在 1.5 秒內就完成了，沒有中斷到')
} catch (err) {
  if (!(err instanceof Anthropic.APIUserAbortError)) throw err
  console.log(`\n第二個請求在 1.5 秒時中斷，中斷前收到 ${partial.length} 個字：${partial || '（還在思考，沒有文字）'}`)
}
