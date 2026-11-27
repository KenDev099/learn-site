// 錯：writeFileSync 一樣先清空再寫，只是卡住自己這個程序；別的程序照樣讀到一半
import { writeFileSync } from 'node:fs'

export async function saveOrders(path: string, orders: unknown[]): Promise<void> {
  writeFileSync(path, JSON.stringify(orders))
}
