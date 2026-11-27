// 練習 1：CartTitle（把購物車數量同步到瀏覽器分頁標題）
// 問題：這個元件只在掛載時設定一次 document.title。客人再加一杯，分頁標題還是舊的數量。
// 要求：
//   1. count 大於 0 時 document.title 是「(數量) 店名」，例如「(3) 咖啡店」；count 是 0 時只有店名
//   2. count 或 shopName 改變時，標題要跟著變；兩個都沒變時，重新 render 不要再寫一次 document.title
//   3. 寫 document.title 是副作用，只能放在 effect 裡，不能放在元件函式本體（render 必須是純的）
// 不能做：用註解關掉 react-hooks 的 lint 檢查；effect 用到的 props 都要列在依賴陣列
import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = `(${count}) ${shopName}`
  }, [])

  return <p>購物車有 {count} 項</p>
}
