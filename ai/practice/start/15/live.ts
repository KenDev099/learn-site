// 用真的 API 跑一次（選用，不影響判分）。四題都做完後，在 ai/practice 執行：
//   node --env-file-if-exists=.env work/15/live.ts
// .env 裡寫 ANTHROPIC_API_KEY=…。伺服器固定用 lib.ts 的 MODEL（claude-opus-5-5）；一次請求通常不到 US$0.01
// 會做兩件事：1. 開一個 SSE 伺服器，用 fetch 當前端，印出收到的原始事件　2. 印出這次請求的 log
import Anthropic from '@anthropic-ai/sdk'
import type { AddressInfo } from 'node:net'
import { createChatServer } from './ex3.ts'

if (!process.env.ANTHROPIC_API_KEY) throw new Error('缺少 ANTHROPIC_API_KEY：在 ai/practice/.env 寫一行 ANTHROPIC_API_KEY=你的 key')
const client = new Anthropic({ timeout: 60_000 })
const server = createChatServer(client, { log: record => console.log('\n寫進 log 的一筆：', JSON.stringify(record, null, 2)) })
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address() as AddressInfo

const res = await fetch(`http://localhost:${port}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: '拿鐵和卡布奇諾差在哪？我的電話是 0912-345-678，有新品請通知我。' }),
})
console.log('狀態', res.status, res.headers.get('content-type'))
const decoder = new TextDecoder()
for await (const chunk of res.body!) process.stdout.write(decoder.decode(chunk, { stream: true }))
server.close()
