// 錯誤寫法：只包 memo，onAdd 每次 render 都是新函式，memo 永遠判定 props 變了
import { memo, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { ProductRow } from './ProductRow.tsx'

const Row = memo(ProductRow)

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
        {products.map(p => <Row key={p.id} product={p} onAdd={add} />)}
      </ul>
    </main>
  )
}
