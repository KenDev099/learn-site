// 錯誤寫法：Map 用索引當鍵，查的時候卻用商品 id。兩邊的鍵對不上，跳到別的列（或找不到）
import { useRef } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function MenuJump({ products }: { products: readonly Product[] }) {
  const rows = useRef<Map<number, HTMLLIElement> | null>(null)
  if (rows.current === null) rows.current = new Map()

  function jumpTo(id: number) {
    const row = rows.current?.get(id)
    row?.scrollIntoView({ block: 'nearest' })
    row?.focus()
  }

  return (
    <section>
      <nav aria-label="快速跳到">
        {products.map(p => (
          <button key={p.id} type="button" onClick={() => jumpTo(p.id)}>跳到 {p.name}</button>
        ))}
      </nav>
      <ul>
        {products.map((p, i) => (
          <li
            key={p.id}
            tabIndex={-1}
            ref={node => {
              if (!node) return
              rows.current?.set(i, node)
              return () => { rows.current?.delete(i) }
            }}
          >
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
