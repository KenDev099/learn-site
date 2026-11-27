// 錯誤寫法：每次把每一列都複製一份，memo 全部失效
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
    const next = lines.some(l => l.id === p.id)
      ? lines.map(l => (l.id === p.id ? { ...l, qty: l.qty + 1 } : { ...l }))
      : [...lines.map(l => ({ ...l })), { id: p.id, name: p.name, qty: 1 }]
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
