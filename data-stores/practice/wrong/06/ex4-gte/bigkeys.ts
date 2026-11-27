// 練習 4：找出並刪除大 key
// findBigKeys(redis, pattern, thresholdBytes, scanCount)
//   1. 用 SCAN 走訪：redis.scan(cursor, 'MATCH', pattern, 'COUNT', scanCount)，回傳 [下一個 cursor, 這一輪的 key]
//      從 cursor '0' 開始，直到回傳的 cursor 又是 '0' 才算走完（中間某一輪拿到 0 個 key 很正常，不能停）
//   2. 每一輪拿到的 key 放進一個 pipeline，一次查 MEMORY USAGE（redis.memory('USAGE', key)）
//      回傳 null 表示 key 在這中間被刪了，跳過
//   3. 回傳 bytes 超過 thresholdBytes（不含等於）的 { key, bytes }，依 bytes 由大到小；SCAN 可能重複回傳同一個 key，結果裡每個 key 只出現一次
//   不能用 KEYS（會一次走完所有 key，期間整台 Redis 不處理別的指令）
// deleteBig(redis, key)：用 UNLINK 刪除（記憶體在背景執行緒釋放），回傳刪掉幾個 key（0 或 1）；不能用 DEL
import type { Redis } from 'ioredis'

export type BigKey = { key: string, bytes: number }

export async function findBigKeys(redis: Redis, pattern: string, thresholdBytes: number, scanCount = 100): Promise<BigKey[]> {
  const found = new Map<string, number>()
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', scanCount)
    cursor = next
    if (keys.length === 0) continue
    const p = redis.pipeline()
    for (const key of keys) p.memory('USAGE', key)
    const results = (await p.exec()) ?? []
    keys.forEach((key, i) => {
      const bytes = results[i][1] as number | null
      if (bytes !== null && bytes >= thresholdBytes) found.set(key, bytes)
    })
  } while (cursor !== '0')
  return [...found].map(([key, bytes]) => ({ key, bytes })).sort((a, b) => b.bytes - a.bytes)
}

export async function deleteBig(redis: Redis, key: string): Promise<number> {
  return redis.unlink(key)
}
