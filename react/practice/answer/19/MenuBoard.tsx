import { memo, useCallback, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { ProductRow } from './ProductRow.tsx'

type Line = { productId: number; quantity: number }

// 在模組層級包一次：每次 render 都 memo(...) 會得到新的元件，React 會整列重新掛載
const Row = memo(ProductRow)

export function MenuBoard({ products }: { products: readonly Product[] }) {
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  // updater function 不讀外面的 lines，依賴陣列是空的，onAdd 永遠是同一個函式
  const add = useCallback((productId: number) => {
    setLines(prev =>
      prev.some(l => l.productId === productId)
        ? prev.map(l => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { productId, quantity: 1 }],
    )
  }, [])

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
