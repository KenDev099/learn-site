import { EventEmitter } from 'node:events'

// 咖啡店開門時發出 'open' 事件，參數是店名
export class Shop extends EventEmitter {
  name: string

  constructor(name: string) {
    super()
    this.name = name
    // 等目前這段同步程式（包含呼叫端的 new 和 on）跑完才發出，而且排在任何計時器之前
    process.nextTick(() => this.emit('open', this.name))
  }
}

// 使用方式：
// const shop = new Shop('信義店')
// shop.on('open', name => console.log(`${name} 開門了`))
