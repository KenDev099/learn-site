import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CartLine, CartPanel, type Line, type Product } from './CartPanel.tsx'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 凍結的菜單：元件只要改了陣列或裡面的商品，就會丟 TypeError
const menu = () => deepFreeze(PRODUCTS.map(({ id, name, price }) => ({ id, name, price })) as Product[])
const seasonal = () => deepFreeze<Product[]>([
  { id: 11, name: '抹茶拿鐵', price: 130 },
  { id: 12, name: '冰美式', price: 85 },
  { id: 13, name: '肉桂捲', price: 85 },
  { id: 14, name: '烏龍茶', price: 60 },
])
const menuOrder = () => within(screen.getByRole('list', { name: '菜單' })).getAllByRole('button').map(b => b.textContent)
const cart = () => within(screen.getByRole('list', { name: '購物車' })).queryAllByRole('listitem').map(li => li.textContent)
const add = (name: string) => fireEvent.click(screen.getByRole('button', { name: `加入${name}` }))

function show(list: Product[], onCartChange?: (lines: Line[]) => void) {
  try {
    render(<CartPanel menu={list} onCartChange={onCartChange} />)
  } catch (e) {
    throw new Error(`render 時丟出錯誤：${(e as Error).message}。測試傳入的菜單是凍結的，menu.sort() 會改到原本的陣列；先複製再排序（toSorted 或 [...menu].sort）`)
  }
}

describe('練習 1：CartPanel 不改 props、不改 state', () => {
  test('菜單依價格由低到高顯示，而且不改到傳進來的 menu', () => {
    show(menu())
    expect(menuOrder(), '價格由低到高；拿鐵和卡布奇諾同價，維持原本的順序').toEqual(
      ['加入可頌', '加入美式咖啡', '加入伯爵紅茶', '加入拿鐵', '加入卡布奇諾', '加入起司蛋糕'])
  })

  test('換一份菜單也照價格排序（不能寫死順序）', () => {
    const list = seasonal()
    show(list)
    expect(menuOrder()).toEqual(['加入烏龍茶', '加入冰美式', '加入肉桂捲', '加入抹茶拿鐵'])
    expect(list.map(p => p.name), '父元件手上的 menu 順序不能變').toEqual(['抹茶拿鐵', '冰美式', '肉桂捲', '烏龍茶'])
  })

  test('加同一個品項兩次，畫面顯示數量 2', () => {
    show(menu())
    add('拿鐵')
    expect(cart()).toEqual(['拿鐵 × 1'])
    add('拿鐵')
    expect(cart(), '第二次加拿鐵後畫面還是「× 1」：CartLine 被記憶化，line 物件沒換就沿用上次的畫面。數量變了的那一列要換成新物件 { ...l, qty: l.qty + 1 }').toEqual(['拿鐵 × 2'])
    add('可頌')
    expect(cart()).toEqual(['拿鐵 × 2', '可頌 × 1'])
  })

  test('交給 onCartChange 的舊購物車之後不會被改', () => {
    const onCartChange = vi.fn<(lines: Line[]) => void>()
    show(menu(), onCartChange)
    add('拿鐵')
    add('可頌')
    add('拿鐵')
    const [[first], [second], [third]] = onCartChange.mock.calls
    expect(first, '第一次交出去的購物車被改了：不能 push 進 state 的陣列，也不能改裡面的物件，每次都建立新的陣列').toEqual([{ id: 2, name: '拿鐵', qty: 1 }])
    expect(second, '第二次交出去的購物車被改了：拿鐵那一列要換成新物件，不能 hit.qty += 1').toEqual([{ id: 2, name: '拿鐵', qty: 1 }, { id: 5, name: '可頌', qty: 1 }])
    expect(third).toEqual([{ id: 2, name: '拿鐵', qty: 2 }, { id: 5, name: '可頌', qty: 1 }])
  })

  test('沒變的那幾列沿用原本的物件', () => {
    const onCartChange = vi.fn<(lines: Line[]) => void>()
    show(menu(), onCartChange)
    add('拿鐵')
    add('可頌')
    add('拿鐵')
    const [[first], [second], [third]] = onCartChange.mock.calls
    expect(second, '每次加入都要是新的陣列').not.toBe(first)
    expect(second[0], '加可頌時拿鐵那一列沒變，要沿用同一個物件（不要把每一列都複製一份，memo 會全部失效）').toBe(first[0])
    expect(third[1], '加拿鐵時可頌那一列沒變，要沿用同一個物件').toBe(second[1])
    expect(third[0], '拿鐵的數量變了，要是新物件').not.toBe(second[0])
  })

  test('CartLine 保留 memo', () => {
    expect((CartLine as unknown as { $$typeof: symbol }).$$typeof, 'CartLine 要維持 memo(...)：它模擬開了 Compiler 之後的自動記憶化，拿掉它只是把問題藏起來').toBe(Symbol.for('react.memo'))
  })

  test('通過 immutability lint，也不關掉規則', async () => {
    const file = join(import.meta.dirname, 'CartPanel.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉規則').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file, { 'react-hooks/immutability': 'error' }), '不能直接改 props 或 state 的屬性，建立新的物件或陣列').toEqual([])
  }, 20000)
})
