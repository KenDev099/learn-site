import { useShallow } from 'zustand/react/shallow'
import { useOrderStore, selectCount, selectSubtotal } from './order-store.ts'

export function AddButton({ productId, name }: { productId: number; name: string }) {
  // action 的參考不會變：選它出來，store 怎麼變這個元件都不會重新 render
  const add = useOrderStore(s => s.add)
  return <button type="button" onClick={() => add(productId)}>加入{name}</button>
}

export function CartBadge() {
  // selector 回傳數字：件數沒變，Object.is 判定相同，就不重新 render
  const count = useOrderStore(selectCount)
  return <p>購物車 {count} 件</p>
}

export function CartTotals() {
  // 一次選兩個值：useShallow 逐一比較物件的屬性，都沒變就回傳上一次的物件
  const { count, subtotal } = useOrderStore(useShallow(s => ({ count: selectCount(s), subtotal: selectSubtotal(s) })))
  return <p>共 {count} 件，小計 ${subtotal}</p>
}

export function OrderTypeSwitch() {
  const orderType = useOrderStore(s => s.orderType)
  const setOrderType = useOrderStore(s => s.setOrderType)
  return (
    <div>
      <button type="button" aria-pressed={orderType === 'here'} onClick={() => setOrderType('here')}>內用</button>
      <button type="button" aria-pressed={orderType === 'togo'} onClick={() => setOrderType('togo')}>外帶</button>
    </div>
  )
}
