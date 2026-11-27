// 假的上游：查庫存要 ms 毫秒。不用改這個檔案
import { setTimeout as sleep } from 'node:timers/promises'

export async function checkStock(drink: string, ms: number): Promise<boolean> {
  await sleep(ms)
  return drink !== '賣完了'
}
