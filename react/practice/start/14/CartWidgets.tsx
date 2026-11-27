/*
練習 4：用 selector 只訂閱需要的部分（CartWidgets）
問題：四個元件都寫 const { … } = useOrderStore()，訂閱了整個 store。
      客人在備註欄打字（setNote）時，頁首的件數、每一顆「加入」按鈕、小計、內用／外帶切換全部重新 render；
      菜單有 200 個商品時，打一個字就重新 render 200 顆按鈕。
要求（畫面上的文字與按鈕不變）：
  1. AddButton：只拿 add。購物車、備註、內用／外帶怎麼變，它都不能重新 render
  2. CartBadge：只在件數改變時重新 render；改備註、改內用／外帶不能重新 render
  3. CartTotals：同時要件數和小計。改備註、改內用／外帶不能重新 render，
     也不能讓 selector 每次回傳新的物件（Zustand 5 會造成無限迴圈，React 丟出 Maximum update depth exceeded）
  4. OrderTypeSwitch：只在 orderType 改變時重新 render；加入商品、改備註都不能重新 render
  5. 件數、小計用 order-store.ts 匯出的 selectCount、selectSubtotal 算
不能做的事：
  - 不要改 order-store.ts，不要自己再 create 一個 store
  - 不要用 memo（memo 只擋「父元件 render」，擋不了 store 的通知）
*/
import { useOrderStore, selectCount, selectSubtotal } from './order-store.ts'

export function AddButton({ productId, name }: { productId: number; name: string }) {
  const { add } = useOrderStore()
  return <button type="button" onClick={() => add(productId)}>加入{name}</button>
}

export function CartBadge() {
  const state = useOrderStore()
  return <p>購物車 {selectCount(state)} 件</p>
}

export function CartTotals() {
  const state = useOrderStore()
  return <p>共 {selectCount(state)} 件，小計 ${selectSubtotal(state)}</p>
}

export function OrderTypeSwitch() {
  const { orderType, setOrderType } = useOrderStore()
  return (
    <div>
      <button type="button" aria-pressed={orderType === 'here'} onClick={() => setOrderType('here')}>內用</button>
      <button type="button" aria-pressed={orderType === 'togo'} onClick={() => setOrderType('togo')}>外帶</button>
    </div>
  )
}
