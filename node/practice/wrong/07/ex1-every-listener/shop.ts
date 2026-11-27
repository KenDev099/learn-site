import { EventEmitter } from 'node:events'

// 錯誤寫法：每次有人掛 'open' 監聽器就補發一次，先掛的人會重複收到
export class Shop extends EventEmitter {
  name: string

  constructor(name: string) {
    super()
    this.name = name
    this.on('newListener', event => {
      if (event === 'open') process.nextTick(() => this.emit('open', this.name))
    })
  }
}
