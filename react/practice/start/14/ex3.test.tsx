import { beforeEach, describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { selectCount, selectSubtotal, useCartStore } from './cart-store.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// store 在模組裡只有一份，每個測試開始前把它設回初始值（Zustand 官方文件的寫法）
beforeEach(() => {
  useCartStore.setState(useCartStore.getInitialState(), true)
})

const LATTE = 2, CROISSANT = 5, CHEESECAKE = 6
const cart = () => useCartStore.getState()
const lines = () => cart().lines.map(l => [l.productId, l.quantity])
// 動作之前先凍結目前的 state：action 如果直接改舊的陣列或物件，會丟 TypeError
const frozen = () => deepFreeze(cart())

function CartBadge() {
  const count = useCartStore(selectCount)
  const subtotal = useCartStore(selectSubtotal)
  const add = useCartStore(s => s.add)
  return (
    <>
      <p>共 {count} 件，小計 ${subtotal}</p>
      <button type="button" onClick={() => add(LATTE)}>加入拿鐵</button>
    </>
  )
}

describe('練習 3：Zustand 購物車 store', () => {
  test('add：同一個商品數量 +1，新商品加在最後', () => {
    frozen()
    act(() => cart().add(LATTE))
    frozen()
    act(() => cart().add(LATTE))
    frozen()
    act(() => cart().add(CROISSANT))
    expect(lines(), 'add 拿鐵兩次、可頌一次：拿鐵一列數量 2、可頌一列數量 1。用 set(state => ({ lines: … })) 回傳新陣列，不要 push 或改舊的列').toEqual([[LATTE, 2], [CROISSANT, 1]])
  })

  test('selectCount、selectSubtotal 從 lines 算出件數與小計', () => {
    act(() => { cart().add(LATTE); cart().add(LATTE); cart().add(CROISSANT) })
    expect(selectCount(cart()), '件數是數量總和：2 + 1').toBe(3)
    expect(selectSubtotal(cart()), '小計是單價 × 數量的總和：110 × 2 + 70 × 1，單價從 PRODUCTS 查').toBe(290)
    act(() => cart().add(CHEESECAKE))
    expect(selectSubtotal(cart())).toBe(410)
  })

  test('數量最多 20', () => {
    act(() => { for (let i = 0; i < 22; i++) cart().add(LATTE) })
    expect(lines(), 'add 22 次，數量停在 20').toEqual([[LATTE, 20]])
    act(() => cart().changeQty(LATTE, 25))
    expect(lines(), 'changeQty 超過 20 當成 20').toEqual([[LATTE, 20]])
  })

  test('changeQty：改數量，0 或負數移除那一列', () => {
    act(() => { cart().add(LATTE); cart().add(CROISSANT); cart().add(CHEESECAKE) })
    frozen()
    act(() => cart().changeQty(CROISSANT, 4))
    expect(lines(), 'changeQty(可頌, 4) 只改可頌那一列，順序不變').toEqual([[LATTE, 1], [CROISSANT, 4], [CHEESECAKE, 1]])
    frozen()
    act(() => cart().changeQty(LATTE, 0))
    expect(lines(), 'changeQty(拿鐵, 0) 要移除拿鐵那一列，不是留一列數量 0').toEqual([[CROISSANT, 4], [CHEESECAKE, 1]])
    act(() => cart().changeQty(CHEESECAKE, -1))
    expect(lines(), '負數也要移除').toEqual([[CROISSANT, 4]])
  })

  test('不可變更新：舊的 state、陣列、列物件都不變', () => {
    act(() => cart().add(LATTE))
    const before = cart()
    const beforeLines = before.lines
    const beforeLine = before.lines[0]
    act(() => cart().add(LATTE))
    expect(cart().lines, '加入之後 lines 要是新的陣列').not.toBe(beforeLines)
    expect(beforeLine.quantity, '舊的那一列物件不能被改到：用 { ...line, quantity: line.quantity + 1 } 建一個新的').toBe(1)
    act(() => cart().setOrderType('togo'))
    expect(before.orderType, '舊的 state 物件不能被改到').toBe('here')
    expect(cart().orderType).toBe('togo')
  })

  test('件數、小計不存成 state', () => {
    act(() => cart().add(LATTE))
    const data = Object.entries(cart()).filter(([, v]) => typeof v !== 'function').map(([k]) => k).sort()
    expect(data, 'state 只有 lines 和 orderType：件數、小計用 selector 算，存成 state 就得在每個 action 裡記得同步').toEqual(['lines', 'orderType'])
  })

  test('clear：所有 state 回到初始值，action 還能用', () => {
    act(() => { cart().add(LATTE); cart().setOrderType('togo') })
    act(() => cart().clear())
    expect(lines(), 'clear 之後 lines 是空的').toEqual([])
    expect(cart().orderType, 'clear 之後 orderType 回到 here：所有 state 都要回到初始值').toBe('here')
    act(() => cart().add(CROISSANT))
    expect(lines(), 'clear 之後 add 還要能用：不要用 set(…, true) 把整個 state 換成只有資料的物件，那樣 action 也被刪掉了').toEqual([[CROISSANT, 1]])
  })

  test('讀 store 的元件跟著更新', async () => {
    const user = userEvent.setup()
    render(<CartBadge />)
    expect(screen.getByText(/^共/)).toHaveTextContent('共 0 件，小計 $0')
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    expect(screen.getByText(/^共/), '按兩次「加入拿鐵」之後畫面要更新：action 要用 set 換成新的 state，Zustand 才會通知元件').toHaveTextContent('共 2 件，小計 $220')
    act(() => cart().clear())
    expect(screen.getByText(/^共/)).toHaveTextContent('共 0 件，小計 $0')
  })
})
