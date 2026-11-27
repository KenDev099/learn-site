// 練習 3：點餐頁 OrderPage（提升 state、不存可以算出來的值）
// 錯誤寫法：updater 函式裡 mutate：陣列是新的所以畫面會動，但 StrictMode 呼叫兩次就加了 2
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

// state 只存「哪個商品、幾個」：品名與單價從 products 查，才會跟著菜單更新
type CartLine = { productId: number; quantity: number }

export function OrderPage({ products }: { products: readonly Product[] }) {
  // 菜單和購物車都要用，所以放在它們共同的父元件
  const [lines, setLines] = useState<CartLine[]>([])

  function add(productId: number) {
    setLines(prev => {
      const line = prev.find(line => line.productId === productId)
      if (!line) return [...prev, { productId, quantity: 1 }]
      line.quantity += 1
      return [...prev]
    })
  }

  function remove(productId: number) {
    setLines(prev => prev.filter(line => line.productId !== productId))
  }

  return (
    <>
      <Menu products={products} lines={lines} onAdd={add} />
      <CartSummary products={products} lines={lines} onRemove={remove} />
    </>
  )
}

type MenuProps = { products: readonly Product[]; lines: CartLine[]; onAdd: (productId: number) => void }

function Menu({ products, lines, onAdd }: MenuProps) {
  return (
    <ul aria-label="菜單">
      {products.map(product => {
        const selected = lines.find(line => line.productId === product.id)?.quantity ?? 0
        return (
          <li key={product.id}>
            <span>{product.name} ${product.price}</span>
            {selected > 0 && <span>已選 {selected}</span>}
            <button type="button" onClick={() => onAdd(product.id)}>加入{product.name}</button>
          </li>
        )
      })}
    </ul>
  )
}

type CartProps = { products: readonly Product[]; lines: CartLine[]; onRemove: (productId: number) => void }

function CartSummary({ products, lines, onRemove }: CartProps) {
  // 每次 render 從 lines 與 products 算出要顯示的列、件數、合計
  const rows = lines.flatMap(line => {
    const product = products.find(p => p.id === line.productId)
    return product ? [{ product, quantity: line.quantity, subtotal: product.price * line.quantity }] : []
  })
  const count = rows.reduce((sum, row) => sum + row.quantity, 0)
  const total = rows.reduce((sum, row) => sum + row.subtotal, 0)

  return (
    <section aria-label="購物車">
      <h2>購物車（{count}）</h2>
      {rows.length === 0 && <p>購物車是空的</p>}
      <ul>
        {rows.map(row => (
          <li key={row.product.id}>
            <span>{row.product.name} × {row.quantity} = ${row.subtotal}</span>
            <button type="button" onClick={() => onRemove(row.product.id)}>移除{row.product.name}</button>
          </li>
        ))}
      </ul>
      <p>合計 ${total}</p>
    </section>
  )
}
