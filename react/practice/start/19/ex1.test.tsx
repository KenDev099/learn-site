import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuBoard } from './MenuBoard.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 數 ProductRow 被呼叫（render）幾次：把它換成會記數的版本，畫面不變
const counter = vi.hoisted(() => ({ rows: [] as number[] }))
vi.mock('./ProductRow.tsx', async importOriginal => {
  const mod = await importOriginal<typeof import('./ProductRow.tsx')>()
  return {
    ProductRow(props: Parameters<typeof mod.ProductRow>[0]) {
      counter.rows.push(props.product.id)
      return mod.ProductRow(props)
    },
  }
})
beforeEach(() => { counter.rows = [] })

const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
const status = () => screen.getByRole('status')
const rowRenders = () => counter.rows.length

function setup(list: readonly Product[] = products) {
  const user = userEvent.setup()
  const ui = (l: readonly Product[]) => <MenuBoard products={l} />
  const view = render(ui(list))
  counter.rows = []
  return { user, rerender: (l: readonly Product[]) => view.rerender(ui(l)) }
}

describe('練習 1：memo 加 useCallback', () => {
  test('畫面：六個商品、購物車一開始是 0', () => {
    setup()
    expect(screen.getByRole('list', { name: '菜單' }).children).toHaveLength(6)
    expect(status()).toHaveTextContent('購物車 0 件，小計 $0')
  })

  test('在備註欄打字：ProductRow 不重新 render', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('textbox', { name: '備註' }), '少冰')
    expect(screen.getByRole('textbox', { name: '備註' }), '輸入框要顯示打的字').toHaveValue('少冰')
    expect(
      rowRenders(),
      '打了 2 個字，ProductRow 被重新 render 了。先用 memo 包住 ProductRow（在 MenuBoard.tsx 寫 const Row = memo(ProductRow)），再用 useCallback 讓 onAdd 每次 render 都是同一個函式：只做其中一個都不夠',
    ).toBe(0)
  })

  test('加入商品：件數與小計正確，ProductRow 也不重新 render', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    expect(status()).toHaveTextContent('購物車 1 件，小計 $110')
    await user.click(screen.getByRole('button', { name: '加入可頌' }))
    expect(status(), '加入第二個商品後，第一個不能不見：useCallback 的依賴是空陣列時，裡面要用 updater function（setLines(prev => …)），不要讀外面的 lines').toHaveTextContent('購物車 2 件，小計 $180')
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    expect(status(), '同一個商品再按一次是數量加一').toHaveTextContent('購物車 3 件，小計 $290')
    expect(
      rowRenders(),
      '加入商品時 ProductRow 被重新 render 了：onAdd 的依賴陣列裡有 lines，購物車一變 onAdd 就換新。改用 updater function，依賴陣列就不需要 lines',
    ).toBe(0)
  })

  test('外層重新 render、products 是同一個陣列：ProductRow 不重新 render', () => {
    const { rerender } = setup()
    rerender(products)
    rerender(products)
    expect(rowRenders(), 'props 都沒變，memo 過的列要跳過').toBe(0)
  })

  test('拿鐵改價：只有那一列重新 render，畫面與小計用新價格', async () => {
    const { user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: '加入拿鐵' }))
    const repriced = deepFreeze(products.map(p => (p.id === 2 ? { ...p, price: 120 } : p)))
    rerender(repriced)
    expect(screen.getByRole('button', { name: '加入拿鐵' }).parentElement, '拿鐵是新物件，那一列要顯示新價格：memo 不要用自訂比較擋掉').toHaveTextContent('拿鐵 $120')
    expect(status(), '小計要用新價格').toHaveTextContent('購物車 1 件，小計 $120')
    expect(counter.rows, '只有換成新物件的拿鐵（id 2）那一列要重新 render，其他商品還是同一個物件').toEqual([2])
  })

  test('依賴陣列通過 exhaustive-deps', async () => {
    expect(await lintHooks(join(import.meta.dirname, 'MenuBoard.tsx')), 'useCallback、useMemo 裡用到的響應值都要列在依賴陣列').toEqual([])
  }, 20000)
})
