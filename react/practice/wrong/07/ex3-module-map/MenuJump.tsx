// 錯誤寫法：Map 放在元件外面。所有 MenuJump 共用一個 Map，後掛上的那一份把前一份的節點蓋掉
import type { Product } from '../../helpers/fake-api.ts'

const rows = new Map<number, HTMLLIElement>()

export function MenuJump({ products }: { products: readonly Product[] }) {
  function jumpTo(id: number) {
    const row = rows.get(id)
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
              rows.set(p.id, node)
              return () => { rows.delete(p.id) }
            }}
          >
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
