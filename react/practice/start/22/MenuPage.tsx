// 練習 3 用的菜單頁（不用改）：列出商品，按「加入」累計購物車件數
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function MenuPage({ products }: { products: readonly Product[] }) {
  const [count, setCount] = useState(0)
  return (
    <main>
      <h1>菜單</h1>
      <p role="status">購物車 {count} 件</p>
      <ul aria-label="菜單">
        {products.map(p => (
          <li key={p.id}>
            {p.name} ${p.price}
            <button type="button" onClick={() => setCount(c => c + 1)}>加入{p.name}</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
