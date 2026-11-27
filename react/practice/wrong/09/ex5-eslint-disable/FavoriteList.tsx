// 練習 5：FavoriteList（Hook 的規則）
// 「我的收藏」列出商品，每一列可以按「說明」展開價格。products 是 null 時表示還在載入。
// 下面的版本在畫面上看起來能用，但違反了 Hook 的規則：
//   - useExpanded() 寫在 early return（載入中）之後：載入完成那一次 render 呼叫的 hook 變多，React 直接丟錯
//   - useExpanded() 寫在 map 迴圈裡：收藏數量一變，hook 的數量跟著變，React 也會丟錯
//   - 就算數量沒變，展開狀態是照「第幾個」對應的：移除第一個商品，原本第二個的展開狀態會跑到別的商品上
// 要求：
//   1. products 從 null 變成清單、清單變長或變短，都不能出錯
//   2. 展開狀態跟著商品走：移除或在前面插入別的商品後，原本展開的商品還是展開，其他商品是收合
//   3. 每一列各自展開，互不影響；畫面結構（li 的 aria-label、按鈕文字「說明」、aria-expanded、展開後的「品名 $價格」）不要改
//   4. react-hooks 的 lint 規則（rules-of-hooks）要通過，不能用註解停用規則
// 提示：迴圈裡需要 state 時，把一列抽成元件，在那個元件的最上層呼叫 hook（第 2 課的 key 也要選對）
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

// 一列的展開狀態（這個 hook 本身沒有問題，不用改）
function useExpanded() {
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen(v => !v)
  return [open, toggle] as const
}

export function FavoriteList({ products }: { products: readonly Product[] | null }) {
  if (products === null) return <p>載入中…</p>

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rows = products.map(product => ({ product, expanded: useExpanded() }))

  return (
    <ul>
      {rows.map(({ product, expanded: [open, toggle] }, i) => (
        <li key={i} aria-label={product.name}>
          {product.name}
          <button type="button" aria-expanded={open} onClick={toggle}>說明</button>
          {open && <p>{product.name} ${product.price}</p>}
        </li>
      ))}
    </ul>
  )
}
