import { EventEmitter } from 'node:events'

// 咖啡店開門時發出 'open' 事件，參數是店名
// 問題：emit 在建構子裡同步執行，這時候 new Shop() 都還沒回傳，沒有人來得及 on('open')
export class Shop extends EventEmitter {
  name: string

  constructor(name: string) {
    super()
    this.name = name
    this.emit('open', this.name)
  }
}

// 使用方式：
// const shop = new Shop('信義店')
// shop.on('open', name => console.log(`${name} 開門了`))   // 永遠收不到
