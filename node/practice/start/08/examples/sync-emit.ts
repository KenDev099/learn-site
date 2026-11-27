// 執行：node examples/sync-emit.ts
// emit 是同步的：監聽器依註冊順序立刻執行，emit 後面那行最後才跑
import { EventEmitter } from 'node:events'

const shop = new EventEmitter()
shop.on('paid', (orderId: number) => console.log('1. 吧台收到訂單', orderId))
shop.on('paid', function (this: EventEmitter, orderId: number) {
  console.log('2. 集點：一般函式的 this 是 emitter 嗎？', this === shop)
})
shop.on('paid', () => console.log('3. 統計：箭頭函式沒有自己的 this'))

console.log('emit 之前')
const had = shop.emit('paid', 42)
console.log('emit 之後，有沒有人在聽：', had)
