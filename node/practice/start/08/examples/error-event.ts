// 執行：node examples/error-event.ts
// 1. 監聽器自己 throw：錯誤從 emit 傳出來，後面的監聽器不會執行
// 2. 沒人監聽 error 時 emit('error')：直接 throw，沒接住就讓程序結束
import { EventEmitter } from 'node:events'

const shop = new EventEmitter()
shop.on('paid', () => { throw new Error('吧台螢幕斷線') })
shop.on('paid', () => console.log('集點（不會印出來）'))
try {
  shop.emit('paid')
} catch (err) {
  console.log('emit 丟出了：', (err as Error).message)
}

console.log('接下來 emit error，沒有人監聽……')
shop.emit('error', new Error('刷卡機故障'))
console.log('這行不會執行')
