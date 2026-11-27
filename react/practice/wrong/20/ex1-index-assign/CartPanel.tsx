// 錯誤寫法：那一列換成新物件，但用索引直接塞回 state 的陣列
import { memo, useState } from 'react'

export type Product = { id: number; name: string; price: number }
export type Line = { id: number; name: string; qty: number }

export const CartLine = memo(function CartLine({ line }: { line: Line }) {
  return <li>{line.name} × {line.qty}</li>
})

export function CartPanel({ menu, onCartChange }: { menu: Product[]; onCartChange?: (lines: Line[]) => void }) {
  const [lines, setLines] = useState<Line[]>([])
  const sorted = menu.toSorted((a, b) => a.price - b.price)   // 回傳新陣列，menu 不變

  function add(p: Product) {
    const i = lines.findIndex(l => l.id === p.id)
    if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + 1 }
    const next = i >= 0 ? [...lines] : [...lines, { id: p.id, name: p.name, qty: 1 }]
    setLines(next)
    onCartChange?.(next)
  }

  return (
    <section>
      <ul aria-label="菜單">
        {sorted.map(p => (
          <li key={p.id}>
            {p.name} {p.price} 元 <button type="button" onClick={() => add(p)}>加入{p.name}</button>
          </li>
        ))}
      </ul>
      <ul aria-label="購物車">
        {lines.map(l => <CartLine key={l.id} line={l} />)}
      </ul>
    </section>
  )
}
