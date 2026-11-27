import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SalesReport } from './SalesReport.tsx'
import type { Order } from './report.ts'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { renderCounter } from '../../helpers/render-count.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 數 rankProducts 被呼叫幾次：換成會記數的版本，結果不變
const spy = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./report.ts', async importOriginal => {
  const mod = await importOriginal<typeof import('./report.ts')>()
  return {
    ...mod,
    rankProducts(...args: Parameters<typeof mod.rankProducts>) {
      spy.calls++
      return mod.rankProducts(...args)
    },
  }
})
const counter = renderCounter()
beforeEach(() => { spy.calls = 0; counter.reset() })

const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
// 拿鐵 5、美式 3、伯爵紅茶 4、可頌 2（數量故意跟 id 順序不同）
const orders = deepFreeze<Order[]>([
  { id: 1, productId: 2, quantity: 2 },
  { id: 2, productId: 1, quantity: 3 },
  { id: 3, productId: 4, quantity: 4 },
  { id: 4, productId: 2, quantity: 3 },
  { id: 5, productId: 5, quantity: 2 },
])

function setup(list: readonly Order[] = orders) {
  const user = userEvent.setup()
  const ui = (o: readonly Order[], p: readonly Product[] = products) => (
    <counter.Profile id="report"><SalesReport orders={o} products={p} /></counter.Profile>
  )
  const view = render(ui(list))
  return { user, view, rerender: (o: readonly Order[], p?: readonly Product[]) => view.rerender(ui(o, p)) }
}
const ranking = (root: HTMLElement = document.body) => {
  const list = within(root).queryByRole('list', { name: '銷售排行' })
  return list ? within(list).getAllByRole('listitem').map(li => li.textContent) : []
}

describe('練習 3：useMemo 快取昂貴的計算', () => {
  test('一開始：用 rankProducts 算出全部商品的排行', () => {
    setup()
    expect(ranking()).toEqual(['拿鐵 5 杯', '伯爵紅茶 4 杯', '美式咖啡 3 杯', '可頌 2 杯'])
    expect(spy.calls, '排行要用 report.ts 的 rankProducts 算，第一次 render 呼叫一次').toBe(1)
  })

  test('在店長備註打字、切換顯示營收：不重算', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('textbox', { name: '店長備註' }), '週末')
    await user.click(screen.getByRole('checkbox', { name: '顯示營收' }))
    expect(ranking(), '勾了顯示營收，每項後面加「 $營收」').toEqual(['拿鐵 5 杯 $550', '伯爵紅茶 4 杯 $360', '美式咖啡 3 杯 $240', '可頌 2 杯 $140'])
    expect(
      spy.calls,
      '打字、切換顯示營收時 rankProducts 又被呼叫了：用 useMemo(() => rankProducts(orders, products, category), [orders, products, category]) 包住，依賴只放計算真的用到的值（showRevenue 只影響顯示，不要放進去）',
    ).toBe(1)
  })

  test('換分類：只重算一次、只 commit 一次', async () => {
    const { user } = setup()
    counter.reset()
    await user.click(screen.getByRole('button', { name: '咖啡' }))
    expect(screen.getByRole('button', { name: '咖啡' })).toHaveAttribute('aria-pressed', 'true')
    expect(ranking(), '換成咖啡之後只剩咖啡的排行：category 要在依賴陣列裡').toEqual(['拿鐵 5 杯', '美式咖啡 3 杯'])
    expect(spy.calls, '換分類要重算剛好一次').toBe(2)
    expect(
      counter.commits('report'),
      '換分類 commit 了不只一次：不要把排行存成 state、再用 effect 更新（會先顯示舊排行，再多 render 一次）。在 render 中用 useMemo 算',
    ).toBe(1)
    await user.click(screen.getByRole('button', { name: '點心' }))
    expect(ranking()).toEqual(['可頌 2 杯'])
    await user.click(screen.getByRole('button', { name: '全部' }))
    expect(ranking()).toHaveLength(4)
  })

  test('沒有資料時顯示提示', async () => {
    const { user } = setup(deepFreeze<Order[]>([{ id: 1, productId: 2, quantity: 1 }]))
    await user.click(screen.getByRole('button', { name: '茶' }))
    expect(screen.getByText('沒有銷售紀錄')).toBeInTheDocument()
  })

  test('外層重新 render：同一份資料不重算，新的 orders 重算一次', () => {
    const { rerender } = setup()
    rerender(orders)
    rerender(orders)
    expect(spy.calls, 'orders、products 都是同一個陣列，不能重算').toBe(1)
    const more = deepFreeze<Order[]>([...orders, { id: 6, productId: 6, quantity: 9 }])
    rerender(more)
    expect(ranking(), 'orders 換成新陣列要重算：orders 要在依賴陣列裡').toEqual(['起司蛋糕 9 杯', '拿鐵 5 杯', '伯爵紅茶 4 杯', '美式咖啡 3 杯', '可頌 2 杯'])
    expect(spy.calls).toBe(2)
    rerender(more, deepFreeze(products.map(p => (p.id === 6 ? { ...p, name: '重乳酪蛋糕' } : p))))
    expect(ranking()[0], 'products 換了也要重算：products 要在依賴陣列裡').toBe('重乳酪蛋糕 9 杯')
  })

  test('同一頁兩個 SalesReport 各算各的', async () => {
    const user = userEvent.setup()
    const a = render(<SalesReport orders={orders} products={products} />)
    const b = render(<SalesReport orders={deepFreeze<Order[]>([{ id: 9, productId: 3, quantity: 7 }])} products={products} />)
    await user.click(within(a.container).getByRole('button', { name: '咖啡' }))
    await user.click(within(b.container).getByRole('button', { name: '咖啡' }))
    expect(ranking(a.container), '第一個 SalesReport 用自己的 orders').toEqual(['拿鐵 5 杯', '美式咖啡 3 杯'])
    expect(ranking(b.container), '第二個 SalesReport 用自己的 orders：不要把快取放在模組層級的變數，所有元件會共用').toEqual(['卡布奇諾 7 杯'])
    await user.click(within(a.container).getByRole('checkbox', { name: '顯示營收' }))
    expect(ranking(a.container)).toEqual(['拿鐵 5 杯 $550', '美式咖啡 3 杯 $240'])
  })

  test('依賴陣列通過 exhaustive-deps', async () => {
    expect(await lintHooks(join(import.meta.dirname, 'SalesReport.tsx')), 'useMemo 裡用到的響應值都要列在依賴陣列，也不要放每次 render 都是新物件的值').toEqual([])
  }, 20000)
})
