// 執行：node examples/on-buffer.ts
// 每 10ms 來一筆訂單，for await 每筆要處理 100ms：處理不完的事件全排在 events.on 的暫存裡
import { EventEmitter, on } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'

const feed = new EventEmitter()
let sent = 0
const ticker = setInterval(() => feed.emit('order', ++sent), 10)
setTimeout(() => { clearInterval(ticker); feed.emit('closed') }, 1_000)

let done = 0
for await (const [id] of on(feed, 'order', { close: ['closed'] })) {
  await sleep(100)
  done++
  if (done % 2 === 0) console.log(`處理完 ${String(done).padStart(3)} 筆，已經收到 ${sent} 筆，排隊中 ${sent - done} 筆（目前這筆 #${id}）`)
}
console.log('closed 之後，排隊中的訂單仍然一筆一筆交出來，總共', done, '筆')
