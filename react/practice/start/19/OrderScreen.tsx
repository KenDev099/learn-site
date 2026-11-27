/*
練習 4：memo 已經包了卻沒用：讓 props 穩定（OrderScreen）
問題：
  ReceiptPreview 已經用 memo 包好，但店員在「桌號」打字時它照樣每個字都重新 render。
  用 React DevTools 的 Profiler 看「Why did this render?」，會看到 Props changed: customer, lines。
要求：
  1. 在「桌號」打字：ReceiptPreview 不重新 render
  2. 改顧客名稱（每打一個字）、勾選「VIP」、按「加一杯 品名」：ReceiptPreview 各重新 render 一次，畫面是最新的
     （同一個商品再加一杯是數量加一）
  3. 外層重新 render、products 是同一個陣列：不重新 render；products 換了（例如改價）：重新 render 一次、用新價格
  4. 傳給 ReceiptPreview 的 props 型別不變：customer 是 { name, vip }，lines 是 { name, price, quantity }[]
不能做的事：
  - 不要改 ReceiptPreview.tsx
  - 不要直接改舊的物件來「保持同一個參考」：memo 會以為沒變，畫面停在舊的
  - 依賴陣列要照 eslint-plugin-react-hooks 的 exhaustive-deps 列完整
*/
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { ReceiptPreview } from './ReceiptPreview.tsx'

type CartLine = { productId: number; quantity: number }

export function OrderScreen({ products }: { products: readonly Product[] }) {
  const [customerName, setCustomerName] = useState('王小明')
  const [vip, setVip] = useState(false)
  const [tableNo, setTableNo] = useState('')
  const [cart, setCart] = useState<CartLine[]>([{ productId: 2, quantity: 1 }])

  function add(productId: number) {
    setCart(prev =>
      prev.some(l => l.productId === productId)
        ? prev.map(l => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { productId, quantity: 1 }],
    )
  }

  return (
    <main>
      <label>顧客名稱 <input value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
      <label><input type="checkbox" checked={vip} onChange={e => setVip(e.target.checked)} /> VIP</label>
      <label>桌號 <input value={tableNo} onChange={e => setTableNo(e.target.value)} /></label>
      {products.map(p => (
        <button key={p.id} type="button" onClick={() => add(p.id)}>加一杯{p.name}</button>
      ))}
      <ReceiptPreview
        customer={{ name: customerName, vip }}
        lines={cart.flatMap(l => {
          const p = products.find(x => x.id === l.productId)
          return p ? [{ name: p.name, price: p.price, quantity: l.quantity }] : []
        })}
      />
    </main>
  )
}
