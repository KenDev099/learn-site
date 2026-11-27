// 模擬「建立資料庫連線池」：要 50ms 才連好（第 20 課會換成真的 pg.Pool）。不要改這個檔
import { setTimeout as sleep } from 'node:timers/promises'

export type Pool = { id: number, query(sql: string): Promise<string> }

let count = 0

export async function createPool(): Promise<Pool> {
  const id = ++count
  console.log(`建立連線池 #${id}`)
  await sleep(50)
  return { id, query: async sql => `連線池 #${id} 執行：${sql}` }
}
