// Redis（第 2～6、15 課）：每一課用自己的資料庫編號（DB N = 第 N 課），每個測試檔開始前 FLUSHDB 清空這個 DB
// 用法：const redis = useRedis(2)   // 在測試檔最上層呼叫；before() 會連線並清空，after() 會關掉連線
import { after, before } from 'node:test'
import { Redis } from 'ioredis'
import { notRunning } from './service.ts'

export const REDIS_PORT = 16479
export const redisUrl = (db: number) => `redis://127.0.0.1:${REDIS_PORT}/${db}`

// 另開一條連到同一個 DB 的連線（例如 pub/sub 的訂閱者、WATCH 時模擬另一位使用者）；測試檔結束時自動關掉
export function newRedis(db: number): Redis {
  const redis = new Redis(redisUrl(db), { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null, commandTimeout: 5_000 })
  after(() => redis.quit().catch(() => redis.disconnect()))
  return redis
}

export function useRedis(db: number): Redis {
  if (!Number.isInteger(db) || db < 1 || db > 15) throw new Error(`Redis 的 DB 編號要是 1～15（用課號），收到 ${db}`)
  const redis = newRedis(db)
  before(async () => {
    try {
      await redis.connect()
    } catch (e) {
      throw notRunning('Redis（127.0.0.1:16479）', 'redis', e)
    }
    await redis.flushdb()   // 只清這一課的 DB，不用 FLUSHALL
  })
  return redis
}
