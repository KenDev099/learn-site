// 自由試的範例：node try.ts（在 learn/data-stores/practice/work/02 執行）
// 連到 DB 0。判分用的是 DB 2，每次判分前會清空，所以這裡寫的東西不會影響判分，判分也不會刪掉這裡的東西
import { Redis } from 'ioredis'

const redis = new Redis('redis://127.0.0.1:16479/0')

await redis.set('ds:demo:count', 5)
console.log('GET 回傳', JSON.stringify(await redis.get('ds:demo:count')))   // "5"：字串
console.log('INCR 回傳', await redis.incr('ds:demo:count'))                // 6：INCR 的回覆本來就是整數
await redis.hset('ds:demo:cart', '2', 1)
console.log('HGETALL 回傳', await redis.hgetall('ds:demo:cart'))          // { '2': '1' }：值也是字串
console.log('不存在的 hash', await redis.hgetall('ds:demo:nope'))          // {}：不是 null
await redis.del('ds:demo:count', 'ds:demo:cart')

await redis.quit()
