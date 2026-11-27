// 拍兩張 heap snapshot：洩漏前一張、洩漏後一張，拿到 Chrome DevTools 的 Memory 面板比較
// 執行：node examples/heap-snapshot.ts
import { writeHeapSnapshot } from 'node:v8'
import { mkdirSync } from 'node:fs'

class CachedOrder {
  id: string
  note: string
  constructor(id: string) {
    this.id = id
    this.note = '請少冰、半糖、外帶'.repeat(20)
  }
}

const orderCache = new Map<string, CachedOrder>()   // 沒有上限的快取
function handle(id: string) {
  if (!orderCache.has(id)) orderCache.set(id, new CachedOrder(id))
}

mkdirSync('snapshots', { recursive: true })
for (let i = 0; i < 1000; i++) handle(`order-${i}`)
console.log('第一張：', writeHeapSnapshot('snapshots/1-before.heapsnapshot'))
for (let i = 1000; i < 21_000; i++) handle(`order-${i}`)
console.log('第二張：', writeHeapSnapshot('snapshots/2-after.heapsnapshot'))
