/*
練習 1：菜單頁（第 14 課的網址狀態、第 15 課的 TanStack Query、第 21 課「換資料時不閃」的判斷）
驗收條件：
  1. 分類只存在網址的 ?category=（coffee／tea／food）。沒有、不合法、出現兩次都當成 coffee。
     點分類按鈕改網址：只改 category，其他 query（例如 ?table=5）保留；要新增一筆歷史紀錄，按上一頁回到上一個分類。
     選中的按鈕 aria-pressed="true"
  2. 菜單用 useQuery 抓：queryKey 要包含分類，queryFn 呼叫 api.getCategory(分類, { signal })
  3. 第一次載入（還沒有任何資料）：<p role="status">載入菜單中…</p>
     失敗：<p role="alert">菜單載入失敗</p> 加一顆「重試」按鈕，按下去重抓
  4. 換分類時，舊分類的菜單留在畫面上（不顯示「載入菜單中…」），<section aria-label="菜單"> 加 aria-busy="true"，
     新的到了才換掉、aria-busy 回到 "false"。看過的分類回去時直接顯示快取
  5. 搜尋框（label「搜尋商品」）：關鍵字只放在這個元件的 state（不要進網址），去掉前後空白後篩選目前分類的品名；
     不會再呼叫 API。篩完沒有東西時顯示 <p>找不到符合的商品</p>
  菜單每一項顯示「品名 $價格」，放在 <ul> 的 <li> 裡
*/
import { useEffect, useState } from 'react'
import type { Category, Product, ShopApi } from '../../shared/api.ts'

const TABS: readonly { value: Category; label: string }[] = [
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '點心' },
]

// 原型：分類放在 state、用 effect 抓資料，只寫了成功的情況
export function MenuPage({ api }: { api: Pick<ShopApi, 'getCategory'> }) {
  const [category, setCategory] = useState<Category>('coffee')
  const [items, setItems] = useState<Product[]>([])

  useEffect(() => {
    api.getCategory(category).then(setItems)
  }, [api, category])

  return (
    <main>
      <div>
        {TABS.map(t => (
          <button key={t.value} type="button" aria-pressed={category === t.value} onClick={() => setCategory(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <section aria-label="菜單">
        <ul>{items.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}</ul>
      </section>
    </main>
  )
}
