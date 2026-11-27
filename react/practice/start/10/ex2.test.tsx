import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuList, type ItemHelpers } from './MenuList.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const menu = (...ids: number[]): readonly Product[] => deepFreeze(ids.map(id => structuredClone(PRODUCTS.find(p => p.id === id)!)))

// 菜單頁的長相：編號、品名、備註欄、加入按鈕
const row = (product: Product, { index, add }: ItemHelpers) => (
  <>
    <span className="no">{index + 1}</span> {product.name}
    <input aria-label={`${product.name} 備註`} />
    <button onClick={add}>加入{product.name}</button>
  </>
)

describe('練習 2：MenuList 用 render prop 讓使用的人決定每一列的長相', () => {
  test('沒傳 renderItem 時，每一列顯示「品名 $價格」', () => {
    render(<MenuList products={menu(2, 5)} onAdd={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.textContent), 'renderItem 沒傳時要有預設的長相「品名 $價格」：可以用參數預設值 renderItem = defaultItem').toEqual(['拿鐵 $110', '可頌 $70'])
  })

  test('有傳 renderItem 時，每個 <li> 的內容是它回傳的東西', () => {
    const renderItem = vi.fn((product: Product) => <strong>{product.name}！</strong>)
    render(<MenuList products={menu(4, 6, 1)} onAdd={() => {}} renderItem={renderItem} />)
    const list = screen.getByRole('list')
    expect(list.tagName, '外層是 <ul>').toBe('UL')
    const items = within(list).getAllByRole('listitem')
    expect(items.map(li => li.innerHTML), '在 <li> 裡呼叫 renderItem(product, helpers)，把回傳值當成 <li> 的內容；<ul> 和 <li> 仍由 MenuList 負責').toEqual([
      '<strong>伯爵紅茶！</strong>', '<strong>起司蛋糕！</strong>', '<strong>美式咖啡！</strong>',
    ])
    expect(renderItem.mock.calls.map(([p]) => p.id), '每個商品各呼叫一次 renderItem，第一個參數是那個商品').toEqual([4, 6, 1])
  })

  test('helpers.index 是第幾列（從 0 開始）', () => {
    const { container } = render(<MenuList products={menu(4, 6, 1)} onAdd={() => {}} renderItem={row} />)
    expect([...container.querySelectorAll('.no')].map(e => e.textContent), 'renderItem 的第二個參數要有 index：map 的第二個參數').toEqual(['1', '2', '3'])
  })

  test('helpers.add() 呼叫 onAdd(這一列商品的 id)', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<MenuList products={menu(1, 4, 6)} onAdd={onAdd} renderItem={row} />)
    await user.click(screen.getByRole('button', { name: '加入伯爵紅茶' }))
    await user.click(screen.getByRole('button', { name: '加入起司蛋糕' }))
    expect(onAdd.mock.calls, 'add 是 () => onAdd(product.id)：只傳 id，不是 index、不是整個商品，也不要把 click 事件傳出去').toEqual([[4], [6]])
  })

  test('商品順序變了，每一列裡的輸入內容要跟著商品走（key 用 product.id）', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MenuList products={menu(1, 2, 6)} onAdd={() => {}} renderItem={row} />)
    await user.type(screen.getByLabelText('拿鐵 備註'), '少冰')
    rerender(<MenuList products={menu(6, 2, 1, 4)} onAdd={() => {}} renderItem={row} />)
    rerender(<MenuList products={menu(2, 6)} onAdd={() => {}} renderItem={row} />)
    expect(screen.getByLabelText('拿鐵 備註'), '重新排序後「少冰」要還在拿鐵那一列：<li> 的 key 用 product.id，不要用 index（第 2 課）').toHaveValue('少冰')
    expect(screen.getByLabelText('起司蛋糕 備註')).toHaveValue('')
  })

  test('products 是空陣列時不 render <ul>，顯示預設的「目前沒有商品」', () => {
    const { container } = render(<MenuList products={menu()} onAdd={() => {}} renderItem={row} />)
    expect(screen.queryByRole('list'), '沒有商品時不要留一個空的 <ul>').toBeNull()
    expect(container.querySelector('p.empty'), '沒有商品時 render <p className="empty">，沒傳 empty 就顯示「目前沒有商品」').toHaveTextContent(/^目前沒有商品$/)
  })

  test('empty 可以傳 JSX', async () => {
    const user = userEvent.setup()
    const onReload = vi.fn()
    const { container } = render(<MenuList products={menu()} onAdd={() => {}} empty={<button onClick={onReload}>重新整理</button>} />)
    await user.click(within(container.querySelector('p.empty') as HTMLElement).getByRole('button', { name: '重新整理' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(container, '有傳 empty 時不顯示預設文字').not.toHaveTextContent('目前沒有商品')
  })

  test('有商品時不顯示 empty', () => {
    const { container } = render(<MenuList products={menu(2)} onAdd={() => {}} empty="賣完了" />)
    expect(container.querySelector('.empty'), '有商品時不能出現 .empty').toBeNull()
    expect(container).not.toHaveTextContent('賣完了')
  })
})
