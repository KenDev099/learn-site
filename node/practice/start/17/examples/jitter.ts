// 1000 個客戶端同時失敗後重試，每 100ms 有幾個請求打到上游：node examples/jitter.ts
const clients = 1000, baseMs = 100, maxMs = 2000

function histogram(label: string, delay: (attempt: number) => number) {
  const buckets = new Map<number, number>()
  for (let c = 0; c < clients; c++) {
    let t = 0
    for (let attempt = 0; attempt < 3; attempt++) {       // 每個客戶端重試 3 次
      t += delay(attempt)
      const b = Math.floor(t / 100) * 100
      buckets.set(b, (buckets.get(b) ?? 0) + 1)
    }
  }
  console.log(`\n${label}（每格 100ms，# = 20 個請求）`)
  for (const [b, n] of [...buckets].sort((x, y) => x[0] - y[0]).slice(0, 12)) {
    console.log(`${String(b).padStart(5)}ms ${String(n).padStart(4)} ${'#'.repeat(Math.ceil(n / 20))}`)
  }
}

const cap = (attempt: number) => Math.min(maxMs, baseMs * 2 ** attempt)
histogram('指數退避，沒有 jitter', cap)
histogram('指數退避 + full jitter', attempt => Math.random() * cap(attempt))
