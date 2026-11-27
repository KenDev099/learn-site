import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

function useExpanded() {
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen(v => !v)
  return [open, toggle] as const
}

// 一列一個元件：hook 在它的最上層呼叫，每一列各自一份 state
function FavoriteRow({ product }: { product: Product }) {
  const [open, toggle] = useExpanded()
  return (
    <li aria-label={product.name}>
      {product.name}
      <button type="button" aria-expanded={open} onClick={toggle}>說明</button>
      {open && <p>{product.name} ${product.price}</p>}
    </li>
  )
}

export function FavoriteList({ products }: { products: readonly Product[] | null }) {
  // 這個元件沒有呼叫 hook，early return 不影響 hook 的順序
  if (products === null) return <p>載入中…</p>

  return (
    <ul>
      {products.map(product => <FavoriteRow key={product.id} product={product} />)}
    </ul>
  )
}
