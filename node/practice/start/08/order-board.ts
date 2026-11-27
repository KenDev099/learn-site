// 出餐看板：吧台做好一杯，就 emit('ready', 訂單)
import { EventEmitter } from 'node:events'

export type Order = { id: number, item: string }

// EventEmitter<{ 事件名稱: [參數…] }>：TypeScript 會檢查 emit 和 on 的參數
export class OrderBoard extends EventEmitter<{ ready: [order: Order] }> {
  ready(order: Order) {
    this.emit('ready', order)
  }
}
