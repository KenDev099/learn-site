// 下單之後要通知很多地方：吧台螢幕、集點、外送平台、營收統計……
// 每個訂閱者（subscriber）各做各的，誰壞掉都不能拖累別人
import { EventEmitter } from 'node:events'

type Listener<T> = (event: T) => void | Promise<void>
type OnError = (err: unknown, name: string) => void

// 問題：直接用 EventEmitter
// 1. emit 是同步的：第一個監聽器 throw，後面的監聽器都不會執行，錯誤還從 publish 丟出去
// 2. async 監聽器 reject 時沒人接住，變成 unhandled rejection
// 3. publish 不等 async 監聽器做完就回傳
export class SafeHub<T> {
  emitter = new EventEmitter()
  onError: OnError

  constructor(onError: OnError) {
    this.onError = onError
  }

  subscribe(name: string, fn: Listener<T>) {
    this.emitter.on('event', fn)
  }

  async publish(event: T): Promise<void> {
    this.emitter.emit('event', event)
  }
}
