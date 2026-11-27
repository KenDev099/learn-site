import { StrictMode } from 'react'
import { describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderPage } from './OrderPage.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const frozen = (products: readonly Product[]) => deepFreeze(structuredClone(products)) as readonly Product[]

// 一律在 StrictMode 裡 render：元件函式與 updater 函式會被多呼叫一次，不純的寫法會現形
function setup(products: readonly Product[] = PRODUCTS) {
  const user = userEvent.setup()
  const view = render(<StrictMode><OrderPage products={frozen(products)} /></StrictMode>)
  const menu = () => within(screen.getByRole('list', { name: '菜單' }))
  const cart = () => within(screen.getByRole('region', { name: '購物車' }))
  return {
    user,
    add: (name: string) => user.click(menu().getByRole('button', { name: `加入${name}` })),
    remove: async (name: string) => {
      const button = cart().queryByRole('button', { name: `移除${name}` })
      if (!button) throw new Error(`購物車裡找不到「移除${name}」按鈕：${name}要先出現在購物車裡（菜單按「加入」後，購物車讀的要是同一份 state）`)
      await user.click(button)
    },
    menuItem: (name: string) => menu().getAllByRole('listitem').find(li => li.textContent?.includes(name))!,
    rows: () => cart().queryAllByRole('listitem').map(li => li.querySelector('span')?.textContent),
    cart,
    setProducts: (next: readonly Product[]) => view.rerender(<StrictMode><OrderPage products={frozen(next)} /></StrictMode>),
  }
}

describe('練習 3：菜單與購物車共用一份 state', () => {
  test('一開始購物車是空的', () => {
    const { cart, rows } = setup()
    expect(rows()).toEqual([])
    expect(cart().getByText('購物車是空的')).toBeInTheDocument()
    expect(cart().getByRole('heading'), '沒有東西時標題是「購物車（0）」').toHaveTextContent('購物車（0）')
    expect(cart().getByText(/^合計/)).toHaveTextContent('合計 $0')
  })

  test('在菜單按「加入」，購物車要出現那個商品', async () => {
    const { add, rows, cart } = setup()
    await add('拿鐵')
    expect(rows(), '按「加入拿鐵」後購物車要有一列「拿鐵 × 1 = $110」：Menu 和 CartSummary 各自的 state 互相看不到，把購物車內容提升到 OrderPage，再用 props 傳給兩個元件').toEqual(['拿鐵 × 1 = $110'])
    expect(cart().queryByText('購物車是空的'), '有東西之後不能再顯示「購物車是空的」').toBeNull()
  })

  test('同一個商品加兩次是同一列數量 2；件數與合計是算出來的', async () => {
    const { add, rows, cart } = setup()
    await add('拿鐵')
    await add('可頌')
    await add('拿鐵')
    expect(rows(), '拿鐵加兩次、可頌加一次：兩列，順序是第一次加入的順序。按一次卻加了 2 的話，是 updater 函式裡 mutate 了（StrictMode 會呼叫它兩次）').toEqual(['拿鐵 × 2 = $220', '可頌 × 1 = $70'])
    expect(cart().getByRole('heading'), '標題的數字是總件數（2 + 1 = 3），不是列數').toHaveTextContent('購物車（3）')
    expect(cart().getByText(/^合計/), '合計 = 每一列小計的總和，在 render 時從購物車內容算出來').toHaveTextContent('合計 $290')
  })

  test('菜單上顯示每個商品已選幾個', async () => {
    const { add, menuItem } = setup()
    await add('拿鐵')
    await add('拿鐵')
    expect(within(menuItem('拿鐵')).queryByText(/^已選/)?.textContent, '菜單的拿鐵要顯示 <span>已選 2</span>：從同一份購物車 state 算出來；直接改 state 物件再 set 回同一個參考，React 不會重新 render').toBe('已選 2')
    expect(within(menuItem('可頌')).queryByText(/^已選/), '沒加入的商品不顯示「已選」').toBeNull()
  })

  test('在購物車按「移除」，菜單、件數、合計都跟著變', async () => {
    const { add, remove, rows, cart, menuItem } = setup()
    await add('拿鐵')
    await add('拿鐵')
    await add('起司蛋糕')
    await remove('拿鐵')
    expect(rows(), '移除拿鐵後只剩起司蛋糕').toEqual(['起司蛋糕 × 1 = $120'])
    expect(within(menuItem('拿鐵')).queryByText(/^已選/), '拿鐵已經被移除，菜單上不能還顯示「已選」：菜單不要自己另外記一份數量').toBeNull()
    expect(cart().getByRole('heading'), '移除後件數要更新').toHaveTextContent('購物車（1）')
    expect(cart().getByText(/^合計/), '移除後合計要更新：合計不要另外存成 state，每次 render 從購物車內容算').toHaveTextContent('合計 $120')
    await remove('起司蛋糕')
    expect(cart().queryByText('購物車是空的'), '全部移除後要顯示 <p>購物車是空的</p>').not.toBeNull()
    expect(cart().getByText(/^合計/)).toHaveTextContent('合計 $0')
  })

  test('移除後再加入，從 1 開始、排在最後', async () => {
    const { add, remove, rows } = setup()
    await add('拿鐵')
    await add('拿鐵')
    await add('可頌')
    await remove('拿鐵')
    await add('拿鐵')
    expect(rows()).toEqual(['可頌 × 1 = $70', '拿鐵 × 1 = $110'])
  })

  test('商品清單來自 props', async () => {
    const { add, rows, cart } = setup([
      { id: 11, name: '抹茶拿鐵', price: 130, category: 'tea' },
      { id: 12, name: '肉桂捲', price: 85, category: 'food' },
    ])
    await add('肉桂捲')
    await add('抹茶拿鐵')
    await add('肉桂捲')
    expect(rows(), '菜單與購物車都要用 props 的 products，不要 import 假資料').toEqual(['肉桂捲 × 2 = $170', '抹茶拿鐵 × 1 = $130'])
    expect(cart().getByText(/^合計/)).toHaveTextContent('合計 $300')
  })

  test('products 換了新的價格，購物車用新的單價', async () => {
    const { add, rows, cart, setProducts } = setup()
    await add('拿鐵')
    await add('拿鐵')
    await add('可頌')
    setProducts(PRODUCTS.map(p => (p.id === 2 ? { ...p, price: 120 } : p)))
    expect(rows(), '拿鐵改成 $120 之後，購物車要顯示「拿鐵 × 2 = $240」：state 只存 productId 與 quantity，單價每次從 products 查。把整個商品物件複製進 state，它就停在加入當時的價格').toEqual(['拿鐵 × 2 = $240', '可頌 × 1 = $70'])
    expect(cart().getByText(/^合計/), '合計也要用新的單價').toHaveTextContent('合計 $310')
  })
})
