// 練習 4：新增一筆訂單（讀出 → 加一筆 → 寫回）
import { readFile } from 'node:fs/promises'
import { saveOrders } from './save-orders.ts'

export type NewOrder = { item: string, quantity: number }
export type Order = NewOrder & { id: number }

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

let tail: Promise<unknown> = Promise.resolve()

export function addOrder(path: string, order: NewOrder): Promise<Order> {
  const run = tail.then(async () => {
    const orders = await readOrders(path)
    check(order)
    const saved = { id: (orders.at(-1)?.id ?? 0) + 1, ...order }
    orders.push(saved)
    await saveOrders(path, orders)
    return saved
  })
  tail = run.catch(() => {})
  return run
}
