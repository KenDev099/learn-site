// 看記憶體洩漏長什麼樣子：每一輪處理 2 萬個請求，強制 GC 之後印出 heapUsed
// 執行：node --expose-gc examples/leak.ts        （沒有上限的快取）
//       node --expose-gc examples/leak.ts fixed  （最多 500 筆的快取）
const fixed = process.argv[2] === 'fixed'
const gc = (globalThis as { gc?: () => void }).gc
if (!gc) throw new Error('要加 --expose-gc：node --expose-gc examples/leak.ts')

const cache = new Map<string, { id: string, note: string }>()

function handle(id: string) {
  let order = cache.get(id)
  if (!order) {
    order = { id, note: '請少冰、半糖、外帶'.repeat(20) + id }
    cache.set(id, order)
    if (fixed && cache.size > 500) cache.delete(cache.keys().next().value!)   // 最舊的那一筆
  }
  return order
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB'
let next = 0
for (let round = 1; round <= 5; round++) {
  for (let i = 0; i < 20_000; i++) handle(`order-${next++}`)   // 每個請求的 id 都不同
  gc()
  const m = process.memoryUsage()
  console.log(`第 ${round} 輪  heapUsed ${mb(m.heapUsed)}  heapTotal ${mb(m.heapTotal)}  rss ${mb(m.rss)}  快取 ${cache.size} 筆`)
}
