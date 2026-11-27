// 練習 3：一次查很多品項的庫存
import { getStock, type Stock } from './supplier.ts'

export type CheckAllOptions = { concurrency?: number, signal?: AbortSignal }

export async function checkAllStock(baseUrl: string, ids: number[], { concurrency = 5, signal }: CheckAllOptions = {}): Promise<Stock[]> {
  const failFast = new AbortController()
  const both = signal ? AbortSignal.any([failFast.signal, signal]) : failFast.signal
  const results: Stock[] = new Array(ids.length)
  // 每 concurrency 個一批，整批做完才做下一批
  try {
    for (let start = 0; start < ids.length; start += concurrency) {
      const batch = ids.slice(start, start + concurrency)
      const got = await Promise.all(batch.map(id => getStock(baseUrl, id, { signal: both })))
      got.forEach((s, k) => { results[start + k] = s })
    }
  } catch (err) {
    failFast.abort(err)    // 第一個失敗：取消其他進行中的請求
    throw err
  }
  return results
}
