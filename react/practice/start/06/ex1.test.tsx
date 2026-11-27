import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuList } from './MenuList.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { renderCounter } from '../../helpers/render-count.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 凍結的菜單：元件只要改了陣列或裡面的商品，就會丟 TypeError
const menu = () => deepFreeze(structuredClone(PRODUCTS) as Product[])
const seasonal = () => deepFreeze<Product[]>([
  { id: 11, name: '抹茶拿鐵', price: 130, category: 'tea' },
  { id: 12, name: '冰美式', price: 85, category: 'coffee' },
  { id: 13, name: '烏龍茶', price: 60, category: 'tea' },
  { id: 14, name: '肉桂捲', price: 85, category: 'food' },
])
const items = () => screen.queryAllByRole('listitem').map(li => li.textContent)
const ALL = ['美式咖啡 $80', '拿鐵 $110', '卡布奇諾 $110', '伯爵紅茶 $90', '可頌 $70', '起司蛋糕 $120']

function setup(products: Product[] = menu()) {
  const counter = renderCounter()
  const user = userEvent.setup()
  const ui = (list: Product[]) => <counter.Profile id="menu"><MenuList products={list} /></counter.Profile>
  const view = render(ui(products))
  return { counter, user, rerender: (list: Product[]) => view.rerender(ui(list)) }
}

describe('練習 1：MenuList 的清單與件數在 render 中算出來', () => {
  test('第一次顯示：全部商品、原本的順序、正確的件數', () => {
    setup()
    expect(items(), '沒選分類、沒勾排序時，要照 products 原本的順序全部列出來').toEqual(ALL)
    expect(screen.getByRole('status'), '件數是清單的長度').toHaveTextContent('共 6 項')
  })

  test('第一次顯示只 render 一次', () => {
    const { counter } = setup()
    expect(counter.mounts('menu')).toBe(1)
    expect(counter.commits('menu'), '第一次顯示之後又多 render 了：清單和件數不要放在 state、用 effect 同步，直接在 render 中算').toBe(0)
  })

  test('按分類：只顯示那個分類，而且只多 render 一次', async () => {
    const { counter, user } = setup()
    counter.reset()
    await user.click(screen.getByRole('button', { name: '茶' }))
    expect(items(), '按「茶」只顯示 category 是 tea 的商品').toEqual(['伯爵紅茶 $90'])
    expect(screen.getByRole('status')).toHaveTextContent('共 1 項')
    expect(screen.getByRole('button', { name: '茶' })).toHaveAttribute('aria-pressed', 'true')
    expect(counter.commits('menu'), '按一次分類只能多 render 一次：setFilter 之後，清單與件數在同一次 render 裡算出來').toBe(1)

    counter.reset()
    await user.click(screen.getByRole('button', { name: '餐點' }))
    expect(items()).toEqual(['可頌 $70', '起司蛋糕 $120'])
    expect(screen.getByRole('status')).toHaveTextContent('共 2 項')
    expect(counter.commits('menu'), '換分類也只能多 render 一次').toBe(1)

    await user.click(screen.getByRole('button', { name: '全部' }))
    expect(items(), '按「全部」回到完整的清單').toEqual(ALL)
  })

  test('勾「便宜的排前面」：價格由低到高，同價維持原順序；取消後回到原本的順序', async () => {
    const { counter, user } = setup()
    counter.reset()
    await user.click(screen.getByRole('checkbox', { name: '便宜的排前面' }))
    expect(items(), '勾起來要依價格由低到高（拿鐵、卡布奇諾同價，拿鐵在前）。不能用 sort() 改 props.products：用 toSorted() 產生新陣列')
      .toEqual(['可頌 $70', '美式咖啡 $80', '伯爵紅茶 $90', '拿鐵 $110', '卡布奇諾 $110', '起司蛋糕 $120'])
    expect(counter.commits('menu'), '勾排序只能多 render 一次').toBe(1)

    await user.click(screen.getByRole('button', { name: '咖啡' }))
    expect(items(), '分類和排序要能同時生效').toEqual(['美式咖啡 $80', '拿鐵 $110', '卡布奇諾 $110'])

    await user.click(screen.getByRole('checkbox', { name: '便宜的排前面' }))
    await user.click(screen.getByRole('button', { name: '全部' }))
    expect(items(), '取消排序要回到 products 原本的順序：排序不能改到 props.products').toEqual(ALL)
  })

  test('父元件換一份 products：清單與件數跟著變，只多 render 一次', async () => {
    const { counter, user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: '茶' }))
    await user.click(screen.getByRole('checkbox', { name: '便宜的排前面' }))
    counter.reset()
    rerender(seasonal())
    expect(items(), 'products 換了，清單要用新的 products 重新算（不要把 props 複製到 state，也不要照範例資料寫死）').toEqual(['烏龍茶 $60', '抹茶拿鐵 $130'])
    expect(screen.getByRole('status')).toHaveTextContent('共 2 項')
    expect(counter.commits('menu'), 'props 換了也只能多 render 一次').toBe(1)

    await user.click(screen.getByRole('button', { name: '全部' }))
    expect(items()).toEqual(['烏龍茶 $60', '冰美式 $85', '肉桂捲 $85', '抹茶拿鐵 $130'])
    expect(screen.getByRole('status')).toHaveTextContent('共 4 項')
  })

  test('沒有在 effect 裡 setState，也沒有用 eslint-disable', { timeout: 20_000 }, async () => {
    const file = join(import.meta.dirname, 'MenuList.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉檢查').not.toContain('eslint-disable')
    const problems = await lintHooks(file, { 'react-hooks/set-state-in-effect': 'error' })
    expect(problems.map(p => `第 ${p.line} 行 ${p.rule}`), '能從 props 與 state 算出來的值不要在 effect 裡 setState；這題不需要任何 effect').toEqual([])
  })
})
