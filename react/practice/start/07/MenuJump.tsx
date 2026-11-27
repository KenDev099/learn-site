// 練習 3：菜單的快速跳轉 MenuJump（列表裡每一列各自的 DOM 節點）
// 問題：菜單很長，上面有一排「跳到 X」按鈕，按了要捲到那個商品並把焦點移過去。
//       現在只有一個 ref，卻掛在每一列上，最後留在 ref 裡的是最後一列：不管按哪一顆，都跳到最後一個商品。
// 要求：
//   1. 按「跳到 X」：X 那一列呼叫 scrollIntoView，並取得焦點（<li> 已經有 tabIndex={-1}，可以用 focus()）
//   2. products 換了（順序改變、有商品下架或上架）之後，還是跳到正確的那一列
//   3. 同一頁放兩個 MenuJump，各自跳自己的列
// 不能做的事：在迴圈或 map 裡呼叫 useRef；用 document.getElementById／querySelector 找元素；把節點存在元件外面的變數
import { useRef } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function MenuJump({ products }: { products: readonly Product[] }) {
  const row = useRef<HTMLLIElement>(null)   // ✗ 只有一個盒子

  function jumpTo(id: number) {   // ✗ 沒有用到 id
    row.current?.scrollIntoView({ block: 'nearest' })
    row.current?.focus()
  }

  return (
    <section>
      <nav aria-label="快速跳到">
        {products.map(p => (
          <button key={p.id} type="button" onClick={() => jumpTo(p.id)}>跳到 {p.name}</button>
        ))}
      </nav>
      <ul>
        {products.map(p => (
          <li key={p.id} tabIndex={-1} ref={row}>
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
