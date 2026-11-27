// 練習 1：ProductCard（把 useEffect 抓資料改成 useQuery）
// 商品卡片顯示一個商品：<ProductCard api={api} id={2} />
// 下面是第 9 課那種「每個元件自己抓」的寫法：兩張卡片顯示同一個商品就送兩個請求，換回看過的商品又要重新等。
// 改用 TanStack Query 的 useQuery。要求：
//   1. 同一個 QueryClient 底下，兩張卡片顯示同一個商品只呼叫 api.getProduct 一次；不同商品各自呼叫
//      QueryClient 由外面的 <QueryClientProvider> 提供（測試會包），元件裡不要自己 new QueryClient
//   2. id 改變時抓新的商品；queryKey 要包含 queryFn 用到的 id
//   3. 呼叫 api.getProduct(id, { signal })：signal 用 queryFn 收到的那個，id 改變時還沒回來的舊請求才會被取消
//   4. 還沒有資料時顯示「載入中…」；換回看過的商品時，快取裡已經有資料，要直接顯示，不能出現「載入中…」
//   5. 失敗時顯示 role="alert"，內容有錯誤訊息，裡面有「重試」按鈕，按下去重新抓（refetch）
//   6. 成功時顯示「品名 $價格」，例如「拿鐵 $110」
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

export function ProductCard({ api, id }: { api: ProductApi; id: number }) {
  const [product, setProduct] = useState<Product | null>(null)

  useEffect(() => {
    let ignore = false
    setProduct(null)
    api.getProduct(id).then(p => { if (!ignore) setProduct(p) }, () => {})
    return () => { ignore = true }
  }, [api, id])

  if (!product) return <p>載入中…</p>
  return <p>{product.name} ${product.price}</p>
}
