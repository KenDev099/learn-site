// 練習 3：productKeys 與 onPriceChanged（query key 的設計與失效）
// 商品相關的 query 都用這裡的 key：
//   useQuery({ queryKey: productKeys.list(keyword), queryFn: () => api.search(keyword) })   // 商品列表（依關鍵字）
//   useQuery({ queryKey: productKeys.detail(id), queryFn: () => api.getProduct(id) })        // 商品詳細
// 門市清單用的是 ['stores']，不屬於商品。
// 店長在後台改了某個商品的價格，前端收到通知後呼叫 onPriceChanged(queryClient, productId)。
// 下面的版本 key 設計得不好，onPriceChanged 也只是把快取刪掉。要求：
//   1. 所有商品的 key 都以 productKeys.all（['products']）開頭：invalidateQueries({ queryKey: productKeys.all }) 要讓所有列表和詳細一起失效
//   2. 不同關鍵字的列表是不同的 key；不同 id 的詳細是不同的 key；列表與詳細不會互相撞到
//   3. onPriceChanged(queryClient, productId)：
//      - 所有商品列表（任何關鍵字）失效，畫面上正在顯示的立刻重抓
//      - 那個商品的詳細失效、重抓；其他商品的詳細不動
//      - 門市清單不動
//      - 現在沒有在畫面上的（看過、已經離開的）不要立刻重抓，下次顯示時才重抓
//   4. onPriceChanged 回傳 Promise，等畫面上正在顯示的 query 重抓完才完成
import type { QueryClient } from '@tanstack/react-query'

export const productKeys = {
  all: ['products'] as const,
  list: (keyword: string) => ['productList'] as const,
  detail: (id: number) => ['product', id] as const,
}

export function onPriceChanged(queryClient: QueryClient, productId: number): Promise<unknown> {
  queryClient.removeQueries({ queryKey: ['product', productId] })
  return Promise.resolve()
}
