// 執行：node examples/async-listener.ts            → async 監聽器 reject，程序當掉（結束碼 1）
//      node examples/async-listener.ts --capture  → captureRejections：rejection 轉成 error 事件
import { EventEmitter } from 'node:events'

const capture = process.argv.includes('--capture')
const shop = new EventEmitter({ captureRejections: capture })
shop.on('paid', async () => {
  throw new Error('集點服務逾時')
})
if (capture) shop.on('error', err => console.log('error 事件收到：', err.message))

shop.emit('paid')
console.log('emit 已經回傳了，async 監聽器的 Promise 還沒 settle')
