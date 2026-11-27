// 錯誤寫法：以為 memo 能擋住重新 render，但 store 的通知不經過父元件，memo 擋不了
import { memo } from 'react'
import { useOrderStore, selectCount, selectSubtotal } from './order-store.ts'

export const AddButton = memo(function AddButton({ productId, name }: { productId: number; name: string }) {
  const { add } = useOrderStore()
  return <button type="button" onClick={() => add(productId)}>加入{name}</button>
})

export const CartBadge = memo(function CartBadge() {
  const state = useOrderStore()
  return <p>購物車 {selectCount(state)} 件</p>
})

export const CartTotals = memo(function CartTotals() {
  const state = useOrderStore()
  return <p>共 {selectCount(state)} 件，小計 ${selectSubtotal(state)}</p>
})

export const OrderTypeSwitch = memo(function OrderTypeSwitch() {
  const { orderType, setOrderType } = useOrderStore()
  return (
    <div>
      <button type="button" aria-pressed={orderType === 'here'} onClick={() => setOrderType('here')}>內用</button>
      <button type="button" aria-pressed={orderType === 'togo'} onClick={() => setOrderType('togo')}>外帶</button>
    </div>
  )
})
