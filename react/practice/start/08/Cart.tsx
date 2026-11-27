// 練習 3：把 Cart 的狀態交給 cartReducer（先完成練習 1）
// 問題：購物車的規則散在六個事件處理函式裡，每個各漏一點：add 沒有檢查上限 20、dec 與 clear 忘了清折扣碼、
//       apply 在空的購物車也能套用。練習 1 的 cartReducer 已經把這些規則寫在同一個地方。
// 要求：
//   1. 用 useReducer(cartReducer, EMPTY_CART) 管 lines 與 coupon，刪掉這兩個 useState 和所有自己算下一個 state 的程式
//   2. 每個操作只 dispatch 一個 action，說明「發生了什麼」：
//        加入○○ → added（帶整個 product）　+ → incremented　− → decremented　移除 → removed（都帶 productId）
//        清空購物車 → cleared　　套用 → coupon_applied（code 是輸入框的內容去掉前後空白），然後清空輸入框
//   3. 輸入框的草稿 code 只有這個元件用，留在 useState
//   4. 總金額用 cartTotal(cart) 在 render 中算，不放 state、不用 effect
//   5. 元件裡不重寫規則：上限、移除、清折扣碼都交給 reducer（+ 按鈕的 disabled 可以留著）
//   畫面的結構（按鈕文字、aria-label）不要改，測試靠它們找元素
// 不能做的事：改 cartReducer.ts 來配合這個元件；在 render 中呼叫 dispatch
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { MAX_QUANTITY, type CartLine } from './cartReducer.ts'

export default function Cart({ menu }: { menu: readonly Product[] }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [coupon, setCoupon] = useState<string | null>(null)
  const [code, setCode] = useState('')

  function add(p: Product) {
    const line = lines.find(l => l.productId === p.id)
    if (line) setLines(lines.map(l => (l === line ? { ...l, quantity: l.quantity + 1 } : l)))
    else setLines([...lines, { productId: p.id, name: p.name, price: p.price, quantity: 1 }])
  }
  function inc(productId: number) {
    setLines(lines.map(l => (l.productId === productId ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QUANTITY) } : l)))
  }
  function dec(productId: number) {
    setLines(lines.map(l => (l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l)).filter(l => l.quantity > 0))
  }
  function remove(productId: number) {
    const rest = lines.filter(l => l.productId !== productId)
    setLines(rest)
    if (rest.length === 0) setCoupon(null)
  }
  function clear() {
    setLines([])
  }
  function apply() {
    setCoupon(code.trim())
    setCode('')
  }

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0)

  return (
    <section>
      <ul aria-label="菜單">
        {menu.map(p => (
          <li key={p.id}>
            {p.name} ${p.price} <button type="button" onClick={() => add(p)}>加入{p.name}</button>
          </li>
        ))}
      </ul>

      <ul aria-label="購物車">
        {lines.map(l => (
          <li key={l.productId}>
            {l.name} × {l.quantity}{' '}
            <button type="button" aria-label={`${l.name}減一`} onClick={() => dec(l.productId)}>−</button>
            <button type="button" aria-label={`${l.name}加一`} disabled={l.quantity >= MAX_QUANTITY} onClick={() => inc(l.productId)}>+</button>
            <button type="button" aria-label={`移除${l.name}`} onClick={() => remove(l.productId)}>移除</button>
          </li>
        ))}
      </ul>
      <p>總金額 <output aria-label="總金額">${total}</output></p>

      <form onSubmit={e => { e.preventDefault(); apply() }}>
        <label>折扣碼 <input value={code} onChange={e => setCode(e.target.value)} /></label>
        <button type="submit">套用</button>
      </form>
      {coupon !== null && <p>已套用折扣碼：{coupon}</p>}

      <button type="button" onClick={clear}>清空購物車</button>
    </section>
  )
}
