// node examples/context-loss.ts：context 在哪裡會跑掉
import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'

const als = new AsyncLocalStorage<string>()
const id = () => als.getStore() ?? '（沒有）'

// 1. 自己維護的 callback 佇列：callback 在「清佇列的人」的 context 執行
const waiters: (() => void)[] = []
als.run('P', () => waiters.push(() => console.log('1. callback 佇列：', id())))
setTimeout(() => waiters.forEach(cb => cb()), 10)

// 2. EventEmitter：監聽器在 emit 的 context 執行，不是在 on 的 context
const bus = new EventEmitter()
als.run('A', () => bus.on('ready', () => console.log('2. 在 A 裡 on，在 B 裡 emit：', id())))
als.run('B', () => setTimeout(() => bus.emit('ready'), 20))

// 3. 修正：AsyncLocalStorage.bind 把函式綁在「現在」的 context
const bus2 = new EventEmitter()
als.run('C', () => bus2.on('ready', AsyncLocalStorage.bind(() => console.log('3. bind 之後：', id()))))
als.run('D', () => setTimeout(() => bus2.emit('ready'), 30))

// 4. await 不會遺失：await 之後還是同一個 context
als.run('E', async () => {
  await new Promise(r => setTimeout(r, 40))
  console.log('4. await 之後：', id())
})
