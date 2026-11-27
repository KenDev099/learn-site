import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

// 錯誤：hook 只呼叫一次（lint 會過），但展開狀態照「第幾個」存，商品一移動就對不上
export function FavoriteList({ products }: { products: readonly Product[] | null }) {
  const [open, setOpen] = useState<boolean[]>([])

  if (products === null) return <p>載入中…</p>

  const toggle = (i: number) => setOpen(prev => {
    const next = [...prev]
    next[i] = !next[i]
    return next
  })

  return (
    <ul>
      {products.map((product, i) => (
        <li key={product.id} aria-label={product.name}>
          {product.name}
          <button type="button" aria-expanded={!!open[i]} onClick={() => toggle(i)}>說明</button>
          {open[i] && <p>{product.name} ${product.price}</p>}
        </li>
      ))}
    </ul>
  )
}
