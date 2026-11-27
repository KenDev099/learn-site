import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddButton, CartBadge, CartTotals, OrderTypeSwitch } from './CartWidgets.tsx'
import { useOrderStore } from './order-store.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const counter = renderCounter()
beforeEach(() => {
  useOrderStore.setState(useOrderStore.getInitialState(), true)
  counter.reset()
})

// 每個元件各包一個 Profiler：它自己重新 render 才會算一次
function Page() {
  const { Profile } = counter
  return (
    <>
      <Profile id="badge"><CartBadge /></Profile>
      <Profile id="add"><AddButton productId={2} name="拿鐵" /><AddButton productId={5} name="可頌" /></Profile>
      <Profile id="totals"><CartTotals /></Profile>
      <Profile id="switch"><OrderTypeSwitch /></Profile>
    </>
  )
}
const store = () => useOrderStore.getState()
const renders = () => ({ 件數: counter.commits('badge'), 加入: counter.commits('add'), 小計: counter.commits('totals'), 內外用: counter.commits('switch') })

describe('練習 4：用 selector 只訂閱需要的部分', () => {
  test('畫面與操作正確', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    await user.click(screen.getByRole('button', { name: '加入可頌' }))
    expect(screen.getByText(/^購物車/)).toHaveTextContent('購物車 3 件')
    expect(screen.getByText(/^共/), '小計是 110 × 2 + 70：用 selectCount、selectSubtotal 算').toHaveTextContent('共 3 件，小計 $290')
    expect(store().lines, '按鈕要呼叫 order-store.ts 的 add，不要自己另外 create 一個 store').toEqual([{ productId: 2, quantity: 2 }, { productId: 5, quantity: 1 }])
    await user.click(screen.getByRole('button', { name: '外帶' }))
    expect(screen.getByRole('button', { name: '外帶' })).toHaveAttribute('aria-pressed', 'true')
    expect(store().orderType).toBe('togo')
  })

  test('改備註：四個元件都不重新 render', () => {
    render(<Page />)
    act(() => store().setNote('少冰'))
    act(() => store().setNote('少冰，去糖'))
    expect(
      renders(),
      '備註跟這四個元件都無關。const { … } = useOrderStore() 或 useOrderStore(s => s) 訂閱的是整個 state，任何欄位變了都會重新 render：改成 useOrderStore(s => s.add)、useOrderStore(selectCount) 這樣只選需要的值',
    ).toEqual({ 件數: 0, 加入: 0, 小計: 0, 內外用: 0 })
  })

  test('加入商品：只有件數和小計重新 render', () => {
    render(<Page />)
    act(() => store().add(2))
    act(() => store().add(5))
    expect(
      renders(),
      '加了兩次商品：件數、小計各重新 render 2 次；「加入」按鈕只用 add（函式的參考不會變），內用／外帶切換只讀 orderType，都不該重新 render',
    ).toEqual({ 件數: 2, 加入: 0, 小計: 2, 內外用: 0 })
  })

  test('切換內用／外帶：只有切換按鈕重新 render', () => {
    render(<Page />)
    act(() => store().setOrderType('togo'))
    expect(renders(), 'orderType 變了，只有 OrderTypeSwitch 重新 render 1 次').toEqual({ 件數: 0, 加入: 0, 小計: 0, 內外用: 1 })
  })

  test('CartTotals 的 selector 不會造成無限迴圈', () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.map(String).join(' ')) })
    let thrown: unknown = null
    try {
      render(<CartTotals />)
      act(() => store().add(2))
    } catch (e) {
      thrown = e
    }
    expect(
      String(thrown ?? errors.find(e => /getSnapshot should be cached|Maximum update depth/.test(e)) ?? ''),
      'selector 每次回傳新的物件 { count, subtotal }，Zustand 5 用 Object.is 比較永遠不相等，就會無限重新 render。用 useShallow 包起來，或分成兩個 selector 各選一個數字',
    ).toBe('')
    expect(screen.getByText(/^共/)).toHaveTextContent('共 1 件，小計 $110')
  })

  test('沒有改用 memo 或自己建 store', () => {
    const source = readFileSync(join(import.meta.dirname, 'CartWidgets.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(source, '不要用 memo：memo 擋不了 store 的通知，要靠 selector').not.toMatch(/\bmemo\b/)
    expect(source, '不要在 CartWidgets.tsx 裡另外 create 一個 store：讀 order-store.ts 的 useOrderStore').not.toMatch(/\bcreate(Store)?\s*[<(]/)
  })
})
