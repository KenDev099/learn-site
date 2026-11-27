// 練習 3：一次查很多品項的庫存
import { getStock, type Stock } from './supplier.ts'

export type CheckAllOptions = { concurrency?: number, signal?: AbortSignal }

export async function checkAllStock(baseUrl: string, ids: number[], { concurrency = 5, signal }: CheckAllOptions = {}): Promise<Stock[]> {
  const failFast = new AbortController()
  const both = signal ? AbortSignal.any([failFast.signal, signal]) : failFast.signal
  const results: Stock[] = []
  let next = 0
  // 開 concurrency 個 worker，每個做完一件就拿下一件
  async function worker() {
    while (next < ids.length) {
      both.throwIfAborted()
      const i = next++
      results.push(await getStock(baseUrl, ids[i], { signal: both }))   // 依索引放，順序跟 ids 一樣
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  } catch (err) {
    failFast.abort(err)    // 第一個失敗：取消其他進行中的請求
    throw err
  }
  return results
}
