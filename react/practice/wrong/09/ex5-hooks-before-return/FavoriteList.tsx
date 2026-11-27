import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

function useExpanded() {
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen(v => !v)
  return [open, toggle] as const
}

// 錯誤：把 hook 移到 early return 之前，但還是在迴圈裡，數量跟著 products 變
export function FavoriteList({ products }: { products: readonly Product[] | null }) {
  const rows = (products ?? []).map(product => ({ product, expanded: useExpanded() }))

  if (products === null) return <p>載入中…</p>

  return (
    <ul>
      {rows.map(({ product, expanded: [open, toggle] }) => (
        <li key={product.id} aria-label={product.name}>
          {product.name}
          <button type="button" aria-expanded={open} onClick={toggle}>說明</button>
          {open && <p>{product.name} ${product.price}</p>}
        </li>
      ))}
    </ul>
  )
}
