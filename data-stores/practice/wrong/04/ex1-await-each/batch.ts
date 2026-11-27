// 練習 1：一次匯入菜單（pipeline）
// key：ds:menu:<id>，型別 hash，欄位 name、price（Redis 存成字串）
// 規則：全部指令放進「一個」pipeline、只 exec 一次；不要在 redis 上直接呼叫 hset 這類寫入指令
// 回傳：寫入失敗的商品 id（照 items 的順序），全部成功時回傳 []
import type { Redis } from 'ioredis'

export type MenuItem = { id: number, name: string, price: number }

export async function importMenu(redis: Redis, items: MenuItem[]): Promise<number[]> {
  const failed: number[] = []
  for (const item of items) {
    try {
      await redis.hset(`ds:menu:${item.id}`, { name: item.name, price: item.price })
    } catch {
      failed.push(item.id)
    }
  }
  return failed
}
