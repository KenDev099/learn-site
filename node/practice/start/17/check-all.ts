// 練習 3：一次查很多品項的庫存
import { getStock, type Stock } from './supplier.ts'

export type CheckAllOptions = { concurrency?: number, signal?: AbortSignal }

export async function checkAllStock(baseUrl: string, ids: number[], { concurrency = 5, signal }: CheckAllOptions = {}): Promise<Stock[]> {
  // TODO：同時最多 concurrency 個；一個失敗就取消其他的；外部 signal 也能取消全部；結果順序跟 ids 一樣
  const results: Stock[] = []
  for (const id of ids) results.push(await getStock(baseUrl, id, { signal }))
  return results
}
