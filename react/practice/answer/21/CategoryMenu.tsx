/*
練習 3：換分類不閃載入畫面：Transition 加 Suspense
問題：
  前台菜單依分類（咖啡／茶／點心）顯示，資料用 use() 讀、外面包 Suspense（第 13 課）。
  第一次載入顯示「載入菜單中…」沒問題；但每次換分類，整份菜單都被換成「載入菜單中…」再出現，畫面一直閃。
要求：
  1. 第一次載入維持現在的樣子：顯示 Suspense 的 fallback <p role="status">載入菜單中…</p>
  2. 換分類時：舊的菜單留在畫面上（不能被藏起來），不顯示「載入菜單中…」，
     另外顯示 <p role="status">切換中…</p>；新分類的資料到了才一起換成新的菜單。用 useTransition
  3. 切換中時，選中的按鈕（aria-pressed="true"）仍然是舊的分類，跟畫面上的菜單一致
  4. 每按一次分類，在按下的時候呼叫 api.getCategory 一次；父元件重新 render 不能再呼叫
  5. 連按兩個分類，最後顯示的是最後按的那個（不管哪個請求先回來），中途不能閃出另一個分類的菜單
不能做的事：
  - 不要改 menu-api.ts
*/
import { Suspense, use, useState, useTransition } from 'react'
import type { Category, Product } from '../../helpers/fake-api.ts'
import type { CategoryApi } from './menu-api.ts'

const TABS: readonly { value: Category; label: string }[] = [
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '點心' },
]

function MenuList({ itemsPromise }: { itemsPromise: Promise<Product[]> }) {
  const items = use(itemsPromise)
  return (
    <ul aria-label="菜單">
      {items.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}

export function CategoryMenu({ api }: { api: CategoryApi }) {
  const [category, setCategory] = useState<Category>('coffee')
  const [itemsPromise, setItemsPromise] = useState(() => api.getCategory('coffee'))
  const [isPending, startTransition] = useTransition()

  function select(next: Category) {
    const promise = api.getCategory(next)   // 在事件裡建立 Promise，不在 render 裡
    startTransition(() => {                 // 兩個 set 都是 Transition：分類和菜單一起換
      setCategory(next)
      setItemsPromise(promise)
    })
  }

  return (
    <section>
      <div>
        {TABS.map(t => (
          <button key={t.value} type="button" aria-pressed={category === t.value} onClick={() => select(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      {isPending && <p role="status">切換中…</p>}
      <Suspense fallback={<p role="status">載入菜單中…</p>}>
        <MenuList itemsPromise={itemsPromise} />
      </Suspense>
    </section>
  )
}
