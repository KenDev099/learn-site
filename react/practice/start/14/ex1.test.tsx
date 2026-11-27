import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuPage } from './MenuPage.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// 數 ProductCard 被呼叫（render）幾次：把它換成會記數的版本，畫面不變
const cards = vi.hoisted(() => ({ renders: 0 }))
vi.mock('./ProductCard.tsx', async importOriginal => {
  const mod = await importOriginal<typeof import('./ProductCard.tsx')>()
  return {
    ProductCard(props: Parameters<typeof mod.ProductCard>[0]) {
      cards.renders++
      return mod.ProductCard(props)
    },
  }
})
beforeEach(() => { cards.renders = 0 })

const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
const names = () => {
  const list = screen.queryByRole('list', { name: '商品' })
  return list ? within(list).getAllByRole('listitem').map(li => li.textContent!.split(' ')[0]) : []
}
const box = () => screen.getByRole('textbox', { name: '搜尋商品' })
const tab = (name: string) => screen.getByRole('button', { name })

describe('練習 1：把 state 放到對的地方', () => {
  test('打字時 ProductCard 不重新 render', async () => {
    const user = userEvent.setup()
    render(<MenuPage products={products} />)
    expect(names()).toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'])
    const first = cards.renders
    await user.type(box(), '拿鐵')
    expect(box(), '輸入框要顯示打的字').toHaveValue('拿鐵')
    expect(
      cards.renders - first,
      '打了 2 個字，ProductCard 被重新 render 了：草稿（draft）放在 MenuPage，每打一個字整頁都重新 render。把草稿的 useState 搬進 SearchBox 元件，送出時才用 onSearch 通知 MenuPage',
    ).toBe(0)
  })

  test('還沒送出的草稿不影響清單，送出之後才篩選', async () => {
    const user = userEvent.setup()
    render(<MenuPage products={products} />)
    await user.type(box(), '拿鐵')
    expect(names(), '只打字、還沒送出時清單不變：不要在 onChange 就通知 MenuPage').toHaveLength(6)
    await user.click(screen.getByRole('button', { name: '搜尋' }))
    expect(names(), '按「搜尋」之後只剩品名包含「拿鐵」的商品').toEqual(['拿鐵'])
    expect(box(), '送出之後輸入框保留文字').toHaveValue('拿鐵')
    await user.clear(box())
    await user.type(box(), '可{Enter}')
    expect(names(), '在輸入框按 Enter 也是送出表單：要用 <form onSubmit>，並呼叫 e.preventDefault()').toEqual(['可頌'])
  })

  test('關鍵字去掉前後空白；空白關鍵字顯示全部', async () => {
    const user = userEvent.setup()
    render(<MenuPage products={products} />)
    await user.type(box(), '  蛋糕  {Enter}')
    expect(names(), '關鍵字要去掉前後空白（trim）再比對').toEqual(['起司蛋糕'])
    await user.clear(box())
    await user.type(box(), '   {Enter}')
    expect(names(), '只有空白的關鍵字等於沒有篩選').toHaveLength(6)
  })

  test('點分類按鈕，按鈕和清單都更新', async () => {
    const user = userEvent.setup()
    render(<MenuPage products={products} />)
    expect(tab('全部')).toHaveAttribute('aria-pressed', 'true')
    await user.click(tab('茶'))
    expect(tab('茶'), '點「茶」之後它要是 aria-pressed="true"').toHaveAttribute('aria-pressed', 'true')
    expect(tab('全部')).toHaveAttribute('aria-pressed', 'false')
    expect(
      names(),
      '點「茶」之後清單只剩茶飲：category 只能有一份，提升到 MenuPage，CategoryTabs 用 props 讀、onChange 往上通知，清單用同一份 category 篩選',
    ).toEqual(['伯爵紅茶'])
    await user.click(tab('點心'))
    expect(names()).toEqual(['可頌', '起司蛋糕'])
    await user.click(tab('全部'))
    expect(names()).toHaveLength(6)
  })

  test('分類和關鍵字同時生效；都不符合時顯示提示', async () => {
    const user = userEvent.setup()
    render(<MenuPage products={products} />)
    await user.click(tab('咖啡'))
    await user.type(box(), '卡{Enter}')
    expect(names(), '咖啡分類 + 關鍵字「卡」只剩卡布奇諾').toEqual(['卡布奇諾'])
    await user.click(tab('茶'))
    expect(names(), '換分類時保留已送出的關鍵字：茶飲裡沒有「卡」').toEqual([])
    expect(screen.getByText('沒有符合的商品')).toBeInTheDocument()
    await user.click(tab('點心'))
    await user.clear(box())
    await user.type(box(), '可{Enter}')
    expect(names()).toEqual(['可頌'])
  })

  test('商品來自 props', async () => {
    const user = userEvent.setup()
    const custom = deepFreeze<Product[]>([
      { id: 11, name: '冰美式', price: 85, category: 'coffee' },
      { id: 12, name: '烏龍茶', price: 75, category: 'tea' },
    ])
    render(<MenuPage products={custom} />)
    expect(names(), '要顯示 props 的 products，不要 import PRODUCTS').toEqual(['冰美式', '烏龍茶'])
    await user.click(tab('茶'))
    expect(names()).toEqual(['烏龍茶'])
  })

  test('沒有用 memo 擋 render', () => {
    const source = readFileSync(join(import.meta.dirname, 'MenuPage.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(source, '這題不用 memo：把草稿搬進 SearchBox，ProductCard 自然不會因為打字重新 render').not.toMatch(/\bmemo\b/)
  })
})
