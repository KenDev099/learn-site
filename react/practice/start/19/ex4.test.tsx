import { join } from 'node:path'
import { memo } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderScreen } from './OrderScreen.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 數 ReceiptPreview 真的 render 了幾次：一樣是 memo，只是裡面多記一次數
const receipt = vi.hoisted(() => ({ renders: 0 }))
vi.mock('./ReceiptPreview.tsx', async importOriginal => {
  const mod = await importOriginal<typeof import('./ReceiptPreview.tsx')>()
  return {
    ...mod,
    ReceiptPreview: memo(function ReceiptPreview(props: Parameters<typeof mod.ReceiptView>[0]) {
      receipt.renders++
      return mod.ReceiptView(props)
    }),
  }
})
beforeEach(() => { receipt.renders = 0 })

const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
const box = () => screen.getByRole('region', { name: '收據' })
const heading = () => within(box()).getByRole('heading').textContent
const items = () => within(box()).queryAllByRole('listitem').map(li => li.textContent)
const total = () => within(box()).getByText(/^合計/).textContent

function setup() {
  const user = userEvent.setup()
  const view = render(<OrderScreen products={products} />)
  receipt.renders = 0
  return { user, rerender: (p: readonly Product[]) => view.rerender(<OrderScreen products={p} />) }
}

describe('練習 4：讓傳給 memo 元件的 props 穩定', () => {
  test('一開始：王小明、一杯拿鐵', () => {
    setup()
    expect(heading()).toBe('王小明')
    expect(items()).toEqual(['拿鐵 x1 $110'])
    expect(total()).toBe('合計 $110')
  })

  test('在桌號打字：ReceiptPreview 不重新 render', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('textbox', { name: '桌號' }), 'A12')
    expect(screen.getByRole('textbox', { name: '桌號' })).toHaveValue('A12')
    expect(
      receipt.renders,
      '桌號跟收據無關，ReceiptPreview 卻重新 render 了：customer={{ … }} 和 lines={cart.flatMap(…)} 每次 render 都是新的物件、新的陣列，memo 用 Object.is 比較永遠不同。用 useMemo 把它們留到依賴改變為止（customer 和 lines 都要）',
    ).toBe(0)
  })

  test('勾選 VIP：重新 render 一次，顯示 9 折', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'VIP' }))
    expect(heading(), '勾了 VIP，收據要顯示（VIP 9 折）：customer 的 useMemo 依賴要有 vip').toBe('王小明（VIP 9 折）')
    expect(total()).toBe('合計 $99')
    expect(receipt.renders).toBe(1)
  })

  test('改顧客名稱：每個字重新 render 一次', async () => {
    const { user } = setup()
    const name = screen.getByRole('textbox', { name: '顧客名稱' })
    await user.clear(name)
    await user.type(name, '陳美華')
    expect(heading(), '收據要顯示新的名稱：customer 的 useMemo 依賴要有 customerName').toBe('陳美華')
    expect(receipt.renders, '清空 1 次加上打 3 個字，ReceiptPreview 應該剛好 render 4 次').toBe(4)
  })

  test('加商品：重新 render 一次，數量正確', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '加一杯可頌' }))
    expect(items(), '加了可頌要出現在收據上：lines 的 useMemo 依賴要有 cart').toEqual(['拿鐵 x1 $110', '可頌 x1 $70'])
    await user.click(screen.getByRole('button', { name: '加一杯拿鐵' }))
    expect(items(), '拿鐵再加一杯是數量加一：依賴要放 cart 本身，不要只放 cart.length').toEqual(['拿鐵 x2 $220', '可頌 x1 $70'])
    expect(total()).toBe('合計 $290')
    expect(receipt.renders).toBe(2)
  })

  test('外層重新 render：products 沒變不 render，改價了 render 一次', () => {
    const { rerender } = setup()
    rerender(products)
    expect(receipt.renders, 'products 是同一個陣列，收據不能重新 render').toBe(0)
    rerender(deepFreeze(products.map(p => (p.id === 2 ? { ...p, price: 120 } : p))))
    expect(items(), '拿鐵改價，收據要用新價格：lines 的 useMemo 依賴要有 products').toEqual(['拿鐵 x1 $120'])
    expect(receipt.renders).toBe(1)
  })

  test('依賴陣列通過 exhaustive-deps', async () => {
    expect(await lintHooks(join(import.meta.dirname, 'OrderScreen.tsx')), 'useMemo 裡用到的響應值都要列在依賴陣列').toEqual([])
  }, 20000)
})
