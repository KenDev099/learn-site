// 用真的 API 跑一次（選用，不影響判分）。先做完練習 1、2，在 ai/practice 執行：
//   node --env-file-if-exists=.env work/13/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…；AI_MODEL=claude-haiku-5-5 可以省錢
// 會送出 1 個 countTokens（免費）和 2 個一樣前綴的請求：第 1 個寫入快取，第 2 個應該讀到快取
import Anthropic from '@anthropic-ai/sdk'
import { DOCS } from '../../helpers/coffee.ts'
import { buildCachedRequest } from './ex2.ts'
import { costOf } from './ex1.ts'
import type { ModelId } from './prices.ts'

const model = (process.env.AI_MODEL ?? 'claude-opus-5-5') as ModelId
// 前綴（tools＋system）至少要 512 token 才會被快取：把三份官方文件都放進去
const doc = DOCS.filter(d => d.trust === 'official').map(d => d.markdown).join('\n\n')
const tools: Anthropic.Tool[] = [{
  name: 'get_order_status', description: '查一張訂單的狀態。顧客問自己的訂單好了沒時使用，需要訂單編號。', strict: true,
  input_schema: { type: 'object', properties: { order_id: { type: 'integer' } }, required: ['order_id'], additionalProperties: false },
}]

const client = new Anthropic({ timeout: 60_000 })
const first = { ...buildCachedRequest(doc, tools, [], '拿鐵可以換燕麥奶嗎？', new Date()), model }
const { input_tokens } = await client.messages.countTokens({ model, system: first.system, tools: first.tools, messages: first.messages })
console.log(`送出前估計：輸入 ${input_tokens} token`)

for (const question of ['拿鐵可以換燕麥奶嗎？', '可頌含麩質嗎？']) {
  const res = await client.messages.create({ ...buildCachedRequest(doc, tools, [], question, new Date()), model })
  const u = res.usage
  console.log(`\n問：${question}`)
  console.log(res.content.filter(b => b.type === 'text').map(b => b.text).join(''))
  console.log(`input ${u.input_tokens}、快取寫入 ${u.cache_creation_input_tokens}、快取讀取 ${u.cache_read_input_tokens}、output ${u.output_tokens}，約 US$${costOf(u, model)}`)
}
console.log('\n第 2 個請求的快取讀取應該大於 0；如果是 0，檢查前綴是否夠長（512 token）或有東西在變')
