// 練習 3：點餐頁 OrderPage（提升 state、不存可以算出來的值）
// 問題：菜單（Menu）和購物車（CartSummary）各自有一份 state，按「加入」之後購物車沒有反應；
//       Menu 直接改 counts 物件，畫面不會更新；CartSummary 把合計另外存成 state，還把整個商品物件複製進 state
// 要求：
//   1. 「購物車裡有什麼」只存一份，放在兩個元件共同的父元件 OrderPage，用 props 往下傳、用函式 props（onAdd、onRemove）往上通知
//   2. state 只存 { productId, quantity }[]。品名、單價從 props 的 products 查；件數、小計、合計都在 render 時算出來，不放進 state
//   3. 菜單：每個商品顯示「品名 $單價」和「加入品名」按鈕；購物車裡有這個商品時顯示 <span>已選 N</span>，沒有就不顯示
//   4. 購物車：標題「購物車（總件數）」；每一列「品名 × 數量 = $小計」和「移除品名」按鈕（按了移除整列）；
//      最下面「合計 $N」；沒有東西時顯示 <p>購物車是空的</p>
//   5. 同一個商品按兩次「加入」是同一列數量 2，不是兩列；列的順序是第一次加入的順序
//   6. 父元件傳了新的 products（例如店長改了價格）時，購物車的小計與合計要用新的單價
// 不能做的事：
//   - 改 props 的 products 或 state 裡的物件、陣列（測試傳入凍結的 products，而且在 StrictMode 裡 render：
//     updater 函式會被呼叫兩次，裡面 mutate 的話按一次會加兩個）
//   - 直接 import 假資料的 PRODUCTS（測試會傳不同的商品清單）
//   - 改畫面上的文字、按鈕名稱、aria-label（測試靠它們找元素）
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

type CartLine = { product: Product; quantity: number }

export function OrderPage({ products }: { products: readonly Product[] }) {
  return (
    <>
      <Menu products={products} />
      <CartSummary />
    </>
  )
}

function Menu({ products }: { products: readonly Product[] }) {
  // 菜單自己記每個商品選了幾個
  const [counts, setCounts] = useState<Record<number, number>>({})

  function add(product: Product) {
    counts[product.id] = (counts[product.id] ?? 0) + 1
    setCounts(counts)
  }

  return (
    <ul aria-label="菜單">
      {products.map(product => (
        <li key={product.id}>
          <span>{product.name} ${product.price}</span>
          {counts[product.id] > 0 && <span>已選 {counts[product.id]}</span>}
          <button type="button" onClick={() => add(product)}>加入{product.name}</button>
        </li>
      ))}
    </ul>
  )
}

function CartSummary() {
  // 購物車也有自己的一份，合計另外存
  const [lines, setLines] = useState<CartLine[]>([])
  const [total] = useState(0)

  function remove(productId: number) {
    setLines(lines.filter(line => line.product.id !== productId))
  }

  return (
    <section aria-label="購物車">
      <h2>購物車（{lines.length}）</h2>
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
  )
}
