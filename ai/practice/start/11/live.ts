// 用真的 API 跑一次評審（選用，不影響判分）。在 ai/practice 執行：
//   node --env-file-if-exists=.env work/11/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…。評審用 Haiku 5.5，4 個回答各評 3 次共 12 次請求，花費不到 1 美分
// 每個回答評 3 次：API 版本 2026-10-21 不能設 temperature，看看評審的結果會不會變
import Anthropic from '@anthropic-ai/sdk'
import { agreement, judgeTone } from './ex3.ts'

const client = new Anthropic()   // 讀環境變數 ANTHROPIC_API_KEY

// 你自己先標的答案（human）：跟評審比一致率
const samples = [
  { q: '拿鐵多少錢？', a: '你好！拿鐵一杯 110 元，也可以改燕麥奶，加價 10 元。', human: true },
  { q: '可以退款嗎？', a: '規定寫得很清楚，自己去看會員條款。', human: false },
  { q: '附近哪裡可以停車？', a: '這個我不確定，我請店員幫你確認，稍等一下喔。', human: true },
  { q: '可頌有過敏原嗎？', a: '可頌含奶油、小麥（麩質）。另外我們也有拿鐵、美式、卡布奇諾、伯爵紅茶、起司蛋糕。拿鐵 110 元。美式 80 元。歡迎光臨。有問題再問我。祝你有美好的一天。', human: false },
]

const pairs: Array<{ judge: boolean; human: boolean }> = []
for (const s of samples) {
  const runs = []
  for (let i = 0; i < 3; i++) runs.push(await judgeTone(client, s.q, s.a))
  console.log(`\n問：${s.q}\n答：${s.a}\n人工：${s.human ? 'pass' : 'fail'}`)
  for (const v of runs) console.log(`  評審：${v.pass ? 'pass' : 'fail'}｜${v.reason}`)
  pairs.push({ judge: runs.filter(v => v.pass).length >= 2, human: s.human })
}
console.log(`\n一致率（3 次取多數）：${agreement(pairs)}`)
