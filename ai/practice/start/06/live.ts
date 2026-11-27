// 用真的 API 跑一次（選用，不影響判分）。在 ai/practice 執行：
//   node --env-file-if-exists=.env work/06/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…；想省錢可以加 AI_MODEL=claude-haiku-5-5
import Anthropic from '@anthropic-ai/sdk'
import { MENU } from '../../helpers/coffee.ts'
import { askWithTools, type OrderStatus } from './ex3.ts'

// 每百萬 token 的美元價格（2026-11-01 官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}
const model = process.env.AI_MODEL ?? 'claude-opus-5-5'
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('缺少 ANTHROPIC_API_KEY：在 ai/practice/.env 寫一行 ANTHROPIC_API_KEY=你的 key')
  process.exit(1)
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 })
// 包一層 messages.create：換成 AI_MODEL 指定的模型，並印出每一次請求的 stop_reason、tool_use 與 usage
const create = client.messages.create.bind(client.messages)
let usd = 0
client.messages.create = (async (body: Anthropic.MessageCreateParamsNonStreaming) => {
  const response = await create({ ...body, model })
  console.log(`\n第 ${body.messages.length === 1 ? 1 : 2} 次請求 → stop_reason: ${response.stop_reason}`)
  for (const block of response.content) if (block.type === 'tool_use') console.log(`  模型要求呼叫 ${block.name}(${JSON.stringify(block.input)})`)
  const price = PRICES[model]
  if (price) usd += (response.usage.input_tokens * price.input + response.usage.output_tokens * price.output) / 1_000_000
  console.log(`  輸入 ${response.usage.input_tokens}、輸出 ${response.usage.output_tokens} token`)
  return response
}) as typeof client.messages.create

// 假的訂單資料（不連資料庫）
const orders: OrderStatus[] = [
  { id: 3, status: 'ready', items: ['美式咖啡', '可頌'], orderedAt: '2026-11-01T09:00:00+08:00' },
  { id: 5, status: 'preparing', items: ['拿鐵'], orderedAt: '2026-11-01T09:05:00+08:00' },
]
const deps = {
  menu: MENU,
  findOrder: async (id: number) => {
    console.log(`  你的程式查了訂單 ${id}`)
    return orders.find(o => o.id === id) ?? null
  },
}

const answer = await askWithTools(client, '我的 3 號和 5 號訂單好了嗎？順便問拿鐵多少錢', deps)
console.log('\n回答：', answer)
console.log(`這次大約花了 US$${usd.toFixed(6)}`)
