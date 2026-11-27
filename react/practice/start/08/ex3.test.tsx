import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Cart from './Cart.tsx'
import { cartReducer } from './cartReducer.ts'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

// 把 cartReducer 包一層記錄用的假函式（行為不變）：測試才看得到 Cart 交給它哪些 action
vi.mock('./cartReducer.ts', async importOriginal => {
  const mod = await importOriginal<typeof import('./cartReducer.ts')>()
  return { ...mod, cartReducer: vi.fn(mod.cartReducer) }
})
const reducer = vi.mocked(cartReducer)
beforeEach(() => { reducer.mockClear() })   // 不能直接回傳：beforeEach 回傳的函式會被當成清理函式呼叫
/** 到目前為止交給 cartReducer 的 action（連續重複的只算一次：React 可能為了同一個 action 多呼叫一次 reducer） */
const actions = () => reducer.mock.calls.map(c => c[1]).filter((a, i, all) => a !== all[i - 1])

const [, latte, , tea] = PRODUCTS as Product[]
const matcha: Product = { id: 9, name: '抹茶拿鐵', price: 130, category: 'tea' }
const menu = [...PRODUCTS, matcha]

function setup() {
  const user = userEvent.setup()
  const counter = renderCounter()
  render(<counter.Profile id="cart"><Cart menu={menu} /></counter.Profile>)
  const button = (name: string) => screen.getByRole('button', { name })
  const lines = () => within(screen.getByRole('list', { name: '購物車' })).queryAllByRole('listitem').map(li => li.textContent.match(/^.+? × \d+/)?.[0])
  const total = () => screen.getByRole('status', { name: '總金額' }).textContent
  return { user, counter, button, lines, total }
}
const THROUGH = '所有的狀態變化都要經過 cartReducer：用 useReducer(cartReducer, EMPTY_CART)，事件處理函式只 dispatch'

describe('練習 3：Cart 用 useReducer，事件處理函式只 dispatch', () => {
  test('按「加入○○」dispatch added（帶整個 product），畫面跟著 reducer 的結果', async () => {
    const { user, button, lines, total } = setup()
    expect(lines(), '一開始購物車是空的').toEqual([])
    await user.click(button('加入拿鐵'))
    await user.click(button('加入抹茶拿鐵'))
    await user.click(button('加入拿鐵'))
    expect(actions(), THROUGH).toEqual([{ type: 'added', product: latte }, { type: 'added', product: matcha }, { type: 'added', product: latte }])
    expect(lines()).toEqual(['拿鐵 × 2', '抹茶拿鐵 × 1'])
    expect(total(), '總金額在 render 中用 cartTotal(cart) 算').toBe('$350')
  })

  test('+、−、移除各 dispatch 一個帶 productId 的 action', async () => {
    const { user, button, lines, total } = setup()
    await user.click(button('加入拿鐵'))
    await user.click(button('加入伯爵紅茶'))
    reducer.mockClear()
    await user.click(button('伯爵紅茶加一'))
    await user.click(button('拿鐵加一'))
    await user.click(button('拿鐵減一'))
    expect(actions(), THROUGH).toEqual([
      { type: 'incremented', productId: tea.id }, { type: 'incremented', productId: latte.id }, { type: 'decremented', productId: latte.id },
    ])
    expect(lines()).toEqual(['拿鐵 × 1', '伯爵紅茶 × 2'])
    expect(total()).toBe('$290')
    await user.click(button('移除拿鐵'))
    expect(actions().at(-1), THROUGH).toEqual({ type: 'removed', productId: latte.id })
    expect(lines()).toEqual(['伯爵紅茶 × 2'])
  })

  test('數量 1 按 − 那一列消失；上限 20 由 reducer 決定', async () => {
    const { user, button, lines } = setup()
    await user.click(button('加入拿鐵'))
    await user.click(button('拿鐵減一'))
    expect(lines(), '數量 1 再減：reducer 會把那一列移除，元件不用自己判斷').toEqual([])
    for (let i = 0; i < 22; i++) await user.click(button('加入拿鐵'))
    expect(lines(), '按了 22 次「加入拿鐵」：數量停在 20（上限寫在 reducer，元件裡不要再寫一份、也不要漏掉）').toEqual(['拿鐵 × 20'])
    expect(button('拿鐵加一'), '已經 20 杯，+ 按鈕要 disabled').toBeDisabled()
  })

  test('套用折扣碼：dispatch coupon_applied（去掉前後空白），輸入框清空', async () => {
    const { user, button } = setup()
    const input = screen.getByRole('textbox', { name: '折扣碼' })
    await user.type(input, 'LATTE20')
    await user.click(button('套用'))
    expect(screen.queryByText(/已套用折扣碼/), '空的購物車不能套用折扣碼（reducer 已經擋了，元件不要自己存 coupon）').not.toBeInTheDocument()
    await user.click(button('加入拿鐵'))
    reducer.mockClear()
    await user.type(input, '  TEA10 ')
    await user.click(button('套用'))
    expect(actions(), 'code 是輸入框的內容去掉前後空白').toEqual([{ type: 'coupon_applied', code: 'TEA10' }])
    expect(screen.getByText('已套用折扣碼：TEA10')).toBeInTheDocument()
    expect(input, '套用之後輸入框要清空（草稿 code 留在 useState）').toHaveValue('')
  })

  test('購物車變空，折扣碼跟著消失', async () => {
    const { user, button } = setup()
    for (const empty of ['拿鐵減一', '移除拿鐵', '清空購物車']) {
      await user.click(button('加入拿鐵'))
      await user.type(screen.getByRole('textbox', { name: '折扣碼' }), 'LATTE20')
      await user.click(button('套用'))
      expect(screen.getByText('已套用折扣碼：LATTE20')).toBeInTheDocument()
      await user.click(button(empty))
      expect(screen.queryByText(/已套用折扣碼/), `按「${empty}」讓購物車變空之後，折扣碼不能還在：coupon 要跟 lines 放在同一個 reducer 的 state 裡`).not.toBeInTheDocument()
    }
  })

  test('清空購物車只 dispatch 一個 cleared', async () => {
    const { user, button, lines, total } = setup()
    await user.click(button('加入拿鐵'))
    await user.click(button('加入伯爵紅茶'))
    reducer.mockClear()
    await user.click(button('清空購物車'))
    expect(actions(), '一個操作對應一個 action：按「清空購物車」是 { type: \'cleared\' }，不是每一列各 dispatch 一次 removed').toEqual([{ type: 'cleared' }])
    expect(lines()).toEqual([])
    expect(total()).toBe('$0')
  })

  test('每個操作只更新畫面一次', async () => {
    const { user, button, counter } = setup()
    await user.click(button('加入拿鐵'))
    expect(counter.commits('cart'), '按一次「加入拿鐵」只能 commit 一次：總金額在 render 中算，不要放進 state 再用 effect 同步（第 6 課）').toBe(1)
    await user.click(button('拿鐵加一'))
    expect(counter.commits('cart'), '再按一次 + 也只多 commit 一次').toBe(2)
  })
})
