// 練習 4：ProductSearch（關鍵字搜尋：enabled 與 placeholderData）
// 搜尋框輸入的關鍵字由父元件傳進來（父元件已經做好防抖）：<ProductSearch api={api} keyword={keyword} />
// 下面是手寫 useEffect 的版本：關鍵字是空的也送請求、換關鍵字時結果整個消失、舊的回應會蓋掉新的。
// 改用 useQuery。要求：
//   1. 關鍵字前後的空白不算（'  茶 ' 就是 '茶'）；去掉空白後是空字串時不送請求，顯示「輸入關鍵字開始搜尋」
//   2. 有關鍵字時呼叫 api.search(關鍵字, { signal })；queryKey 要包含（去掉空白後的）關鍵字
//   3. 第一次搜尋、還沒有任何結果時顯示「搜尋中…」
//   4. 換關鍵字、新結果還沒回來時：保留上一個關鍵字的結果，另外顯示 role="status" 的「更新中…」，不能顯示「搜尋中…」
//      （用 placeholderData: keepPreviousData）
//   5. 換回搜尋過的關鍵字：直接顯示快取
//   6. 結果是 <ul>，每個商品一個 <li>，內容是品名；沒有符合的商品時顯示「沒有符合的商品」
//   7. 失敗時顯示 role="alert" 的錯誤訊息
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type SearchApi = Pick<FakeMenuApi, 'search'>

export function ProductSearch({ api, keyword }: { api: SearchApi; keyword: string }) {
  const [results, setResults] = useState<Product[] | null>(null)

  useEffect(() => {
    setResults(null)
    api.search(keyword).then(setResults, () => {})
  }, [api, keyword])

  if (!results) return <p>搜尋中…</p>
  if (results.length === 0) return <p>沒有符合的商品</p>
  return (
    <ul>
      {results.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  )
}
