/*
練習 1：用 memo 加 useCallback，讓菜單的每一列不跟著重新 render（MenuBoard）
問題：
  在備註欄打一個字，MenuBoard 重新 render，每一個 ProductRow 也跟著重新 render。
  （想像菜單有 200 個商品，每一列都有圖片和選項）
要求：
  1. 在備註欄打字時，ProductRow 一次都不能重新 render
  2. 按某一列的「加入」：購物車件數與小計要更新（同一個商品再按一次是數量加一），ProductRow 也不能重新 render
  3. MenuBoard 因為外層重新 render、products 是同一個陣列時，ProductRow 不能重新 render
  4. products 換成新陣列、其中一個商品換成新物件（例如拿鐵改價）時，只有那一列重新 render，畫面和小計都用新價格
  5. 畫面不變：label「備註」的輸入框；<p role="status">「購物車 N 件，小計 $X」；
     <ul aria-label="菜單"> 裡每個商品一個 <ProductRow>
不能做的事：
  - 不要改 ProductRow.tsx
  - 不要用 memo 的第二個參數（自訂比較函式）硬擋：比較寫錯，畫面就停在舊的
  - 依賴陣列要照 eslint-plugin-react-hooks 的 exhaustive-deps 列完整
*/
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { ProductRow } from './ProductRow.tsx'

type Line = { productId: number; quantity: number }

export function MenuBoard({ products }: { products: readonly Product[] }) {
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  function add(productId: number) {
    setLines(
      lines.some(l => l.productId === productId)
        ? lines.map(l => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { productId, quantity: 1 }],
    )
  }

  const count = lines.reduce((sum, l) => sum + l.quantity, 0)
  const subtotal = lines.reduce((sum, l) => sum + (products.find(p => p.id === l.productId)?.price ?? 0) * l.quantity, 0)

  return (
    <main>
      <label>備註 <input value={note} onChange={e => setNote(e.target.value)} /></label>
      <p role="status">購物車 {count} 件，小計 ${subtotal}</p>
      <ul aria-label="菜單">
        {products.map(p => <ProductRow key={p.id} product={p} onAdd={add} />)}
      </ul>
    </main>
  )
}
