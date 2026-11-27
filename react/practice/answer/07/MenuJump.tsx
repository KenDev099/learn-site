// 練習 3：菜單的快速跳轉 MenuJump（列表裡每一列各自的 DOM 節點）
import { useRef } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function MenuJump({ products }: { products: readonly Product[] }) {
  // 一個 ref 放一個 Map：商品 id → 那一列的 DOM 節點
  const rows = useRef<Map<number, HTMLLIElement> | null>(null)
  if (rows.current === null) rows.current = new Map()   // 只在第一次建立（render 中唯一允許的 ref 寫法）

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
        {products.map(p => (
          <li
            key={p.id}
            tabIndex={-1}
            ref={node => {
              if (!node) return
              rows.current?.set(p.id, node)                 // 這一列掛上 DOM：登記
              return () => { rows.current?.delete(p.id) }   // 這一列離開 DOM：移除
            }}
          >
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
