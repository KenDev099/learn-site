// 練習 5：ProductDetail（依 productId 抓商品，處理競態）
// 問題：這個元件只在掛載時抓一次。從清單點別的商品（productId 改變），畫面還是第一個商品。
// 要求：
//   1. 掛載時、以及 productId 每次改變時，呼叫 api.getProduct(productId, { signal })
//   2. 載入中顯示「載入中…」（換商品時也要回到載入中，不能還顯示上一個商品）；
//      成功後在 <p className="name"> 顯示「品名 $價格」，例如「拿鐵 $110」
//   3. 失敗時在 <p role="alert"> 顯示錯誤的 message；換到別的商品時錯誤要清掉
//   4. 切換太快時只顯示最新的商品：比較晚回來的舊回應不能蓋掉新的結果
//   5. productId 改變或元件卸載時，用 AbortController 取消還沒回來的請求；被取消不是錯誤，不能顯示出來
// 不能做：用註解關掉 react-hooks 的 lint 檢查；把 effect 的函式寫成 async
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)

  useEffect(() => {
    api.getProduct(productId).then(setProduct)
  }, [])

  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
