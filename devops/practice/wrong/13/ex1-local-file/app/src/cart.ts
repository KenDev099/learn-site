// 錯誤寫法：購物車寫在容器自己的檔案系統，每個副本各有一份，重建容器就不見
import type { Redis } from 'ioredis'
import { readFile, writeFile } from 'node:fs/promises'

const file = (sid: string) => `/tmp/cart-${sid}.json`

export async function addItem(redis: Redis, sid: string, productId: number): Promise<void> {
  const items = await getCart(redis, sid)
  items.push(productId)
  await writeFile(file(sid), JSON.stringify(items))
}

export async function getCart(redis: Redis, sid: string): Promise<number[]> {
  try { return JSON.parse(await readFile(file(sid), 'utf8')) } catch { return [] }
}
