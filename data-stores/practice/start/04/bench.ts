// 自由試：pipeline 省下多少時間。node bench.ts（在 learn/data-stores/practice/work/04 執行）
// 連到 DB 0，不影響判分（判分用 DB 4）
import { Redis } from 'ioredis'

const redis = new Redis('redis://127.0.0.1:16479/0')
const N = 1000

let t = performance.now()
for (let i = 0; i < N; i++) await redis.hset(`ds:bench:${i}`, 'price', 80)   // 每個都等回覆：N 次來回
console.log(`逐一 await：${(performance.now() - t).toFixed(0)} ms`)

t = performance.now()
const p = redis.pipeline()
for (let i = 0; i < N; i++) p.hset(`ds:bench:${i}`, 'price', 80)
await p.exec()                                                              // 一次送出、一次收回
console.log(`pipeline：${(performance.now() - t).toFixed(0)} ms`)

const keys = Array.from({ length: N }, (_, i) => `ds:bench:${i}`)
await redis.del(...keys)
await redis.quit()
