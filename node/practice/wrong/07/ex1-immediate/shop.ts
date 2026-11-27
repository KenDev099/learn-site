import { EventEmitter } from 'node:events'

// 咖啡店開門時發出 'open' 事件，參數是店名
export class Shop extends EventEmitter {
  name: string

  constructor(name: string) {
    super()
    this.name = name
    // setImmediate 要等到 check phase，主程式裡排的 setTimeout(0) 可能先跑
    setImmediate(() => this.emit('open', this.name))
  }
}

// 使用方式：
// const shop = new Shop('信義店')
// shop.on('open', name => console.log(`${name} 開門了`))
