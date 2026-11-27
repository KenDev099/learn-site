// 錯誤寫法：只捲動、沒有移動焦點。用鍵盤或螢幕閱讀器的人不知道畫面跳到哪裡
import { useRef } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function MenuJump({ products }: { products: readonly Product[] }) {
  const rows = useRef<Map<number, HTMLLIElement> | null>(null)
  if (rows.current === null) rows.current = new Map()

  function jumpTo(id: number) {
    rows.current?.get(id)?.scrollIntoView({ block: 'nearest' })
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
              rows.current?.set(p.id, node)
              return () => { rows.current?.delete(p.id) }
            }}
          >
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
