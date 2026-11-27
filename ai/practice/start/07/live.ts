// 用真的 API 跑一次（選用，不影響判分）。先做完練習 2、3，在 ai/practice 執行：
//   node --env-file-if-exists=.env work/07/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…
// 這一課的函式固定用 tools.ts 的 MODEL（claude-opus-5-5，測試會檢查），所以這裡不看 AI_MODEL；一次任務通常幾輪、幾美分以內
import Anthropic from '@anthropic-ai/sdk'
import { ORDERS } from '../../helpers/coffee.ts'
import { MODEL } from './tools.ts'
import { runGuardedAgent } from './ex2.ts'
import { FakeDb, PendingActions, makeOrderTools } from './ex3.ts'
import type { OrderStatus } from './ex3.ts'

// 每百萬 token 的美元價格（2026-11-01 官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

// 王小明（顧客 1）的 7 號訂單還沒開始做，3 號已經在製作
const status: Record<number, OrderStatus> = { 1: 'done', 3: 'preparing', 7: 'received' }
const db = new FakeDb(ORDERS.map(o => ({ ...o, status: status[o.id] ?? 'done' })))
const pending = new PendingActions()
const tools = makeOrderTools(1, db, pending)

const client = new Anthropic({ timeout: 60_000 })
const result = await runGuardedAgent(client, '我今天早上點的那杯美式不要了，幫我取消。另一張在做的也一起取消。', tools, { maxTurns: 8, maxTokens: 60_000 })
console.log(JSON.stringify(result, null, 2))
console.log('\n待店員確認的動作：', pending.list())
console.log('7 號訂單的狀態（應該還是 received）：', db.findOrder(7)?.status)
const price = PRICES[MODEL]
const usd = (result.tokens.input * price.input + result.tokens.output * price.output) / 1_000_000
console.log(`這次任務共 ${result.turns} 輪，約 US$${usd.toFixed(6)}（輸入 ${result.tokens.input}、輸出 ${result.tokens.output} token）`)
