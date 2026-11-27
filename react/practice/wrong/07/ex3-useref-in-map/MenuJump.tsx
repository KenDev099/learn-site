// 錯誤寫法：在迴圈裡呼叫 useRef。Hook 的數量跟著商品數量變，商品一增減 React 就報錯，lint 也會擋
import { useRef, type RefObject } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function MenuJump({ products }: { products: readonly Product[] }) {
  const refs = new Map<number, RefObject<HTMLLIElement | null>>()
  products.forEach(p => { refs.set(p.id, useRef<HTMLLIElement>(null)) })

  function jumpTo(id: number) {
    const row = refs.get(id)?.current
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
            ref={refs.get(p.id)}
          >
            {p.name} ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
