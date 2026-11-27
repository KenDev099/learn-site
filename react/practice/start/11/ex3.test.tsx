import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartProvider, useCart, useCartDispatch } from './cart-context.tsx'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const counter = renderCounter()
beforeEach(() => counter.reset())
const nameOf = (id: number) => PRODUCTS.find(p => p.id === id)!.name

// 只需要 dispatch 的元件：菜單上的「加入」按鈕
function AddButton({ productId }: { productId: number }) {
  counter.track(`AddButton ${productId}`)
  const dispatch = useCartDispatch()
  return <button type="button" onClick={() => dispatch({ type: 'add', productId })}>加入{nameOf(productId)}</button>
}
function ClearButton() {
  counter.track('ClearButton')
  const dispatch = useCartDispatch()
  return <button type="button" onClick={() => dispatch({ type: 'clear' })}>清空</button>
}
// 需要購物車內容的元件
function CartSummary() {
  counter.track('CartSummary')
  const lines = useCart()
  const dispatch = useCartDispatch()
  return (
    <aside aria-label="購物車">
      <p>共 {lines.reduce((n, l) => n + l.quantity, 0)} 件</p>
      <ul>
        {lines.map(l => (
          <li key={l.productId}>
            {nameOf(l.productId)} × {l.quantity}
            <button type="button" onClick={() => dispatch({ type: 'remove', productId: l.productId })}>移除{nameOf(l.productId)}</button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
// 不讀任何 context 的元件
function Footer() {
  counter.track('Footer')
  return <footer>營業時間 08:00–20:00</footer>
}
const app = (
  <CartProvider>
    <AddButton productId={2} />
    <AddButton productId={5} />
    <ClearButton />
    <CartSummary />
    <Footer />
  </CartProvider>
)
const items = () => screen.queryAllByRole('listitem').map(li => li.firstChild!.textContent! + li.childNodes[1].textContent + li.childNodes[2].textContent)

describe('練習 3：購物車的 state 與 dispatch 拆成兩個 context', () => {
  test('dispatch 之後，useCart() 的元件拿到新的購物車', async () => {
    const user = userEvent.setup()
    render(app)
    expect(screen.getByText(/^共/)).toHaveTextContent('共 0 件')
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    await user.click(screen.getByRole('button', { name: '加入可頌' }))
    expect(screen.getByText(/^共/), '加兩杯拿鐵、一個可頌之後要是 3 件：CartProvider 要把 useReducer 的 lines 提供出去').toHaveTextContent('共 3 件')
    expect(items()).toEqual(['拿鐵 × 2', '可頌 × 1'])
    await user.click(screen.getByRole('button', { name: '移除拿鐵' }))
    expect(items(), '移除拿鐵之後只剩可頌').toEqual(['可頌 × 1'])
    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText(/^共/), '清空之後是 0 件').toHaveTextContent('共 0 件')
  })

  test('只呼叫 useCartDispatch() 的元件，購物車變了也不重新 render', async () => {
    const user = userEvent.setup()
    render(app)
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    await user.click(screen.getByRole('button', { name: '加入可頌' }))
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    expect(screen.getByText(/^共/)).toHaveTextContent('共 3 件')
    expect(counter.calls('CartSummary'), '讀 lines 的 CartSummary 每次變動都要重新 render（第一次 + 3 次變動）').toBe(4)
    expect(
      [counter.calls('AddButton 2'), counter.calls('AddButton 5'), counter.calls('ClearButton')],
      'AddButton、ClearButton 只用 dispatch，購物車變了 3 次它們都不該重新 render。lines 和 dispatch 要放在兩個 context：dispatch 那個 context 的 value 直接放 useReducer 回傳的 dispatch（不要包成物件或箭頭函式），useCartDispatch() 只讀 dispatch 的 context。陣列是 [加入拿鐵, 加入可頌, 清空] 的 render 次數',
    ).toEqual([1, 1, 1])
    expect(counter.calls('Footer'), '不讀 context 的元件也不該重新 render').toBe(1)
  })

  test('外層重新 render 時，讀 context 的元件都不重新 render', () => {
    const { rerender } = render(app)
    const children = app.props.children
    rerender(<CartProvider>{children}</CartProvider>)
    expect(
      [counter.calls('AddButton 2'), counter.calls('ClearButton'), counter.calls('CartSummary')],
      'CartProvider 自己重新 render、購物車沒變時，兩個 context 的 value 都要跟上次是同一個（lines 與 dispatch 本身），不要每次 render 新建物件。陣列是 [加入拿鐵, 清空, CartSummary] 的 render 次數',
    ).toEqual([1, 1, 1])
  })

  test('兩個 CartProvider 各自獨立', async () => {
    const user = userEvent.setup()
    render(
      <>
        <section aria-label="內用"><CartProvider><AddButton productId={2} /><CartSummary /></CartProvider></section>
        <section aria-label="外帶"><CartProvider><AddButton productId={2} /><CartSummary /></CartProvider></section>
      </>,
    )
    await user.click(within(screen.getByRole('region', { name: '外帶' })).getByRole('button', { name: '加入拿鐵' }))
    expect(within(screen.getByRole('region', { name: '外帶' })).getByText(/^共/)).toHaveTextContent('共 1 件')
    expect(within(screen.getByRole('region', { name: '內用' })).getByText(/^共/), '外帶加了拿鐵，內用的購物車不能跟著變').toHaveTextContent('共 0 件')
  })

  test('上面沒有 CartProvider 時，兩個 hook 都丟出說明清楚的錯誤', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function OnlyCart() { return <p>{useCart().length}</p> }
    function OnlyDispatch() { useCartDispatch(); return null }
    expect(() => render(<OnlyCart />), '兩個 context 的預設值都給 null，hook 讀到 null 就丟錯').toThrow('useCart() 必須在 <CartProvider> 之下使用')
    expect(
      () => render(<OnlyDispatch />),
      'useCartDispatch() 也要檢查：不要拿一個什麼都不做的函式當預設值，那樣忘了放 CartProvider 時按「加入」沒反應、也沒有錯誤訊息',
    ).toThrow('useCartDispatch() 必須在 <CartProvider> 之下使用')
  })
})
