// 搜尋結果的快取：同一個關鍵字只呼叫一次 api.search，之後都回傳同一個 Promise。
// use() 要讀「被快取的 Promise」（第 13 課），正式專案這件事通常交給 TanStack Query 或框架。這個檔案不用改
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function createSearchCache(api: FakeMenuApi) {
  const cache = new Map<string, Promise<Product[]>>()
  return {
    read(keyword: string): Promise<Product[]> {
      let p = cache.get(keyword)
      if (!p) {
        p = api.search(keyword)
        cache.set(keyword, p)
      }
      return p
    },
  }
}
export type SearchCache = ReturnType<typeof createSearchCache>
