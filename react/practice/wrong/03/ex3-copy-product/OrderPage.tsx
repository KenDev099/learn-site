// 練習 3：點餐頁 OrderPage（提升 state、不存可以算出來的值）
// 錯誤寫法：把整個商品物件複製進 state：菜單改價後，購物車還是加入當時的價格
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

type CartLine = { product: Product; quantity: number }

export function OrderPage({ products }: { products: readonly Product[] }) {
  const [lines, setLines] = useState<CartLine[]>([])

  function add(product: Product) {
    setLines(prev =>
      prev.some(line => line.product.id === product.id)
        ? prev.map(line => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...prev, { product, quantity: 1 }],
    )
  }

  function remove(productId: number) {
    setLines(prev => prev.filter(line => line.product.id !== productId))
  }

  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0)

  return (
    <>
      <ul aria-label="菜單">
        {products.map(product => {
          const selected = lines.find(line => line.product.id === product.id)?.quantity ?? 0
          return (
            <li key={product.id}>
              <span>{product.name} ${product.price}</span>
              {selected > 0 && <span>已選 {selected}</span>}
              <button type="button" onClick={() => add(product)}>加入{product.name}</button>
            </li>
          )
        })}
      </ul>
      <section aria-label="購物車">
        <h2>購物車（{count}）</h2>
        {lines.length === 0 && <p>購物車是空的</p>}
        <ul>
          {lines.map(line => (
            <li key={line.product.id}>
              <span>{line.product.name} × {line.quantity} = ${line.product.price * line.quantity}</span>
              <button type="button" onClick={() => remove(line.product.id)}>移除{line.product.name}</button>
            </li>
          ))}
        </ul>
        <p>合計 ${total}</p>
      </section>
    </>
  )
}
