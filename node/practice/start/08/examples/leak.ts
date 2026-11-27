// 執行：node examples/leak.ts
//      node --trace-warnings examples/leak.ts   → 印出是哪一行加了第 11 個監聽器
// 每個請求都在共用的 board 上 on('ready')，卻沒有 off
import { EventEmitter } from 'node:events'

const board = new EventEmitter()

function handleRequest(orderId: number) {
  board.on('ready', (id: number) => {
    if (id === orderId) console.log('通知客人：訂單', id, '好了')
  })
}

for (let i = 1; i <= 12; i++) handleRequest(i)
console.log('ready 監聽器數量：', board.listenerCount('ready'))
