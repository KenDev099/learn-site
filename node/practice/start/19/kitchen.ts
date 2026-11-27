// 廚房：不用改這個檔案
// 把 15 ms 內進來的訂單湊成一批一起做，做好時對每張單 emit('ready:<號碼>')
import { EventEmitter } from 'node:events'

export class Kitchen extends EventEmitter {
  #queue: number[] = []
  #next = 1

  order(drink: string): number {
    const ticket = this.#next++
    this.#queue.push(ticket)
    // 這一批的第一張單才設計時器：計時器是在「第一張單的請求」裡建立的
    if (this.#queue.length === 1) setTimeout(() => this.#flush(), 15)
    return ticket
  }

  #flush() {
    const batch = this.#queue
    this.#queue = []
    for (const ticket of batch) this.emit(`ready:${ticket}`)
  }
}
