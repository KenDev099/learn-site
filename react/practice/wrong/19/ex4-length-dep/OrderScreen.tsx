// 錯誤寫法：依賴只放 cart.length：同一個商品加一杯，長度沒變，收據不更新
import { useMemo, useState } from 'react'
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

  // 名稱或 VIP 沒變，就是上一次的同一個物件
  const customer = useMemo(() => ({ name: customerName, vip }), [customerName, vip])
  // 購物車或商品沒變，就是上一次的同一個陣列
  const lines = useMemo(
    () => cart.flatMap(l => {
      const p = products.find(x => x.id === l.productId)
      return p ? [{ name: p.name, price: p.price, quantity: l.quantity }] : []
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart.length, products],
  )

  return (
    <main>
      <label>顧客名稱 <input value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
      <label><input type="checkbox" checked={vip} onChange={e => setVip(e.target.checked)} /> VIP</label>
      <label>桌號 <input value={tableNo} onChange={e => setTableNo(e.target.value)} /></label>
      {products.map(p => (
        <button key={p.id} type="button" onClick={() => add(p.id)}>加一杯{p.name}</button>
      ))}
      <ReceiptPreview customer={customer} lines={lines} />
    </main>
  )
}
