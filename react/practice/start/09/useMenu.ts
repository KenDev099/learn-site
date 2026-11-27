// 練習 4：useMenu（抓資料的 hook：載入、錯誤、競態、取消）
// 菜單頁依關鍵字查商品。useMenu(api, keyword) 回傳 { products, loading, error, reload }：
//   const { products, loading, error, reload } = useMenu(api, keyword)
// 下面的版本只會載入，其他都沒做。要求：
//   1. 掛載時、keyword 改變時呼叫 api.search(keyword, { signal })；signal 來自這次 effect 自己的 AbortController
//   2. loading：目前的 keyword 的結果還沒回來時是 true，回來（成功或失敗）後是 false。
//      keyword 一換，同一次畫面更新 loading 就要是 true：不能有「新的 keyword、loading 是 false、products 還是舊的」的畫面。
//      做法：不要在 effect 裡 setLoading(true)（那會晚一次 render，第 6 課），把 loading 寫成衍生值：
//      記下手上的結果是哪一次請求的，render 時比對它是不是目前這一次
//   3. error：請求失敗時是那個 Error，否則是 null；重新載入、換 keyword 之後要清掉。被取消的請求不算錯誤
//   4. keyword 改變或元件卸載時取消上一個請求（abort）；而且不管 API 有沒有理會 signal，過期的回應都不能蓋掉新的結果
//   5. reload()：用同一個 keyword 重新查一次；reload 的參考要穩定（每次 render 都是同一個函式）
//   6. react-hooks 的 lint 規則要通過，不能用註解停用規則
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>

export function useMenu(api: MenuApi, keyword: string) {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    api.search(keyword).then(setProducts, () => {})
  }, [api, keyword])

  const error: Error | null = null
  return { products, loading: false, error, reload: () => {} }
}
