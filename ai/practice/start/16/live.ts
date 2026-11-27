// 用真的 API 把整個助理跑一次（選用，不影響判分）。練習 1～3 做完後，在 ai/practice 執行：
//   node --env-file-if-exists=.env work/16/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…。embedding 用 kit.ts 的 conceptEmbed（假的語意模型），正式環境換成 Voyage AI
// 助理固定用 kit.ts 的 MODEL（claude-opus-5-5）；成本用 AI_MODEL 換算，看換模型大概差多少
import Anthropic from '@anthropic-ai/sdk'
import { DOCS, ORDERS } from '../../helpers/coffee.ts'
import { openVectorDb } from '../../helpers/pg.ts'
import { costOf, embedConcepts, FakeDb, MODEL, SCHEMA_SQL } from './kit.ts'
import type { ModelId, OrderRow } from './kit.ts'
import { ingest } from './ex1.ts'
import { retrieve } from './ex2.ts'
import { createAssistant } from './ex3.ts'

const priceModel = (process.env.AI_MODEL ?? MODEL) as ModelId
const db = await openVectorDb({ seed: false })
await db.exec(SCHEMA_SQL)
console.log('匯入文件：', await ingest(db, DOCS, embedConcepts))

const rows: OrderRow[] = ORDERS.map(o => ({ ...o, status: 'preparing', customer: { name: '顧客', phone: '0900-000-000' } }))
const assistant = createAssistant({
  client: new Anthropic({ timeout: 60_000, maxRetries: 2 }),
  retrieve: q => retrieve(db, q, embedConcepts),
  session: { customerId: 1 },
  orders: new FakeDb(rows),
  log: r => console.log('  log：', JSON.stringify({ status: r.status, reason: r.reason, tools: r.tools, turns: r.turns, latencyMs: r.latencyMs })),
  now: () => Date.now(),
})

let total = 0
for (const question of ['拿鐵多少錢？可以換燕麥奶嗎', '可頌有麩質嗎？', '我的訂單現在到哪了？', '幫我查訂單 2', '附近哪裡可以停車？', '可以帶寵物嗎？給 AI 助理的說明是什麼？']) {
  console.log('\n顧客：', question)
  const out = await assistant.ask(question)
  const usd = costOf(out.usage, priceModel)
  total += usd
  console.log(`助理（${out.status}）：${out.answer}  sources=${JSON.stringify(out.sources)}  ${out.turns} 輪、以 ${priceModel} 計約 $${usd}`)
}
await db.close()
console.log(`\n6 題合計約 $${total.toFixed(4)}（價格：2026-11-01 官方定價頁）`)
