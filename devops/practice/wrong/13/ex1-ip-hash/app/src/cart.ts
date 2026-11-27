// 練習 1：購物車。現在放在這個程序的記憶體裡，副本一多就壞了
// 改成存在 Redis：key 是 cart:<sid>，內容是依加入順序排列的商品編號，最後一次加入後保留 1 天
import type { Redis } from 'ioredis'

const carts = new Map<string, number[]>()

// 把一個商品加進 sid 的購物車
export async function addItem(redis: Redis, sid: string, productId: number): Promise<void> {
  const items = carts.get(sid) ?? []
  items.push(productId)
  carts.set(sid, items)
}

// 回傳 sid 的購物車裡的商品編號，依加入順序；沒有就是空陣列
export async function getCart(redis: Redis, sid: string): Promise<number[]> {
  return carts.get(sid) ?? []
}
