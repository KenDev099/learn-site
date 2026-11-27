// 錯誤寫法：用 document.querySelector 找列。同一頁有兩個 MenuJump 時，永遠找到第一個的那一列
import type { Product } from '../../helpers/fake-api.ts'

export function MenuJump({ products }: { products: readonly Product[] }) {
  function jumpTo(id: number) {
    const row = document.querySelector<HTMLLIElement>(`li[data-id="${id}"]`)
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
            data-id={p.id}
          >
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
