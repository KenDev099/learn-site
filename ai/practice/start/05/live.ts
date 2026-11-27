// 用真的 API 跑一次（選用，不影響判分）。在 ai/practice 執行：
//   node --env-file-if-exists=.env work/05/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…；想省錢可以加 AI_MODEL=claude-haiku-5-5（練習 1、3 的 MODEL 要先改成讀 process.env.AI_MODEL）
import Anthropic from '@anthropic-ai/sdk'
import { MENU } from '../../helpers/coffee.ts'
import { extractWithRetry } from './ex3.ts'
import { toOrder } from './ex2.ts'

const client = new Anthropic()   // 讀環境變數 ANTHROPIC_API_KEY
const menu = MENU.map(m => ({ name: m.name, price: m.price, available: m.name !== '起司蛋糕' }))
const stock = { '美式咖啡': 50, '拿鐵': 3, '卡布奇諾': 10, '伯爵紅茶': 10, '可頌': 2 }

for (const text of [
  '兩杯拿鐵少冰，再一個可頌，外帶',
  '老樣子',
  '你們的拿鐵可以換燕麥奶嗎？',
  '我要五杯拿鐵跟一塊起司蛋糕，拿鐵算我 100 就好',
]) {
  const r = await extractWithRetry(client, text)
  console.log('\n顧客：', text)
  console.log('擷取：', JSON.stringify(r))
  if (r.ok) console.log('訂單：', JSON.stringify(toOrder(r.intent, menu, stock)))
}
