// 練習 4：新增一筆訂單（讀出 → 加一筆 → 寫回）
import { open, readFile, rm, stat } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { saveOrders } from './save-orders.ts'

export type NewOrder = { item: string, quantity: number }
export type Order = NewOrder & { id: number }

const STALE_MS = 5_000   // 鎖檔超過 5 秒沒更新，當成當掉的程序留下的

// 檔案不存在就當成還沒有訂單
async function readOrders(path: string): Promise<Order[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

function check(order: NewOrder) {
  if (typeof order.item !== 'string' || order.item === '') throw new TypeError('item 要是非空字串')
  if (!Number.isInteger(order.quantity) || order.quantity < 1) throw new RangeError('quantity 要是正整數')
}

// 拿到鎖才回傳：'wx' = 不存在才建立，存在就 EEXIST，檢查和建立是同一個動作
async function acquire(lockPath: string) {
  while (true) {
    try {
      return await open(lockPath, 'wx')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    try {
      const { mtimeMs } = await stat(lockPath)
      if (Date.now() - mtimeMs >= 0) {
        await rm(lockPath, { force: true })   // 當掉的程序留下的鎖：移除後馬上重拿
        continue
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue   // 剛好被放掉了，馬上重拿
      throw err
    }
    await sleep(10 + Math.random() * 20)      // 別人拿著：等 10～30ms 再試，加隨機避免大家同時重試
  }
}

export async function addOrder(path: string, order: NewOrder): Promise<Order> {
  const lockPath = path + '.lock'
  const handle = await acquire(lockPath)
  try {
    const orders = await readOrders(path)
    check(order)
    const saved = { id: (orders.at(-1)?.id ?? 0) + 1, ...order }
    orders.push(saved)
    await saveOrders(path, orders)
    return saved
  } finally {
    await handle.close()
    await rm(lockPath, { force: true })       // 成功、失敗都要放掉鎖
  }
}
