import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { renderCounter } from '../../helpers/render-count.tsx'
import { lineKey, selectCount, selectSubtotal, useCartStore } from './features/cart/cart-store.ts'
import { CartBadge } from './features/cart/CartBadge.tsx'
import type { CartLine } from './shared/api.ts'

beforeEach(() => {
  useCartStore.setState(useCartStore.getInitialState(), true)
  localStorage.clear()
})

const LATTE = PRODUCTS[1], CROISSANT = PRODUCTS[4]
const cart = () => useCartStore.getState()
const rows = () => cart().lines.map(l => `${l.name}/${l.size}/${l.sugar}×${l.quantity}@${l.unitPrice}`)
const frozen = () => deepFreeze(cart())
const stored = () => {
  const raw = localStorage.getItem('cart')
  return raw === null ? null : JSON.parse(raw)
}
/** 把資料放進 storage，假裝重新整理：讓 persist 再讀一次（localStorage 是同步的，讀完才回來） */
function reload(raw: string) {
  useCartStore.setState(useCartStore.getInitialState(), true)
  localStorage.setItem('cart', raw)
  const persist = (useCartStore as unknown as { persist?: { rehydrate: () => unknown } }).persist
  if (!persist) throw new Error('useCartStore 沒有 persist：用 zustand/middleware 的 persist 包住 store')
  persist.rehydrate()
}
const LINE: CartLine = { key: lineKey(2, { size: 'M', sugar: 'less' }), productId: 2, name: '拿鐵', size: 'M', sugar: 'less', unitPrice: 110, quantity: 2 }

describe('練習 2：購物車 store 與徽章', () => {
  test('商品＋大小＋甜度都一樣才是同一列；大杯 +20', () => {
    frozen()
    act(() => cart().add(LATTE, { size: 'M', sugar: 'normal' }))
    frozen()
    act(() => cart().add(LATTE, { size: 'M', sugar: 'none' }))
    frozen()
    act(() => cart().add(LATTE, { size: 'M', sugar: 'normal' }))
    frozen()
    act(() => cart().add(LATTE, { size: 'L', sugar: 'normal' }))
    expect(rows(), '正常甜和無糖的拿鐵是兩列，吧台才知道要做兩種；key 要包含商品、大小、甜度。大杯單價 110 + 20').toEqual([
      '拿鐵/M/normal×2@110', '拿鐵/M/none×1@110', '拿鐵/L/normal×1@130',
    ])
    expect(new Set(cart().lines.map(l => l.key)).size, '每一列的 key 都不一樣').toBe(3)
  })

  test('數量最多 20；changeQty 改數量，0 或負數移除；不可變更新', () => {
    act(() => { for (let i = 0; i < 22; i++) cart().add(CROISSANT, { size: 'M', sugar: 'normal' }) })
    expect(rows(), 'add 22 次，數量停在 20').toEqual(['可頌/M/normal×20@70'])
    act(() => cart().add(LATTE, { size: 'L', sugar: 'less' }))
    const before = frozen()
    const latte = cart().lines[1]
    act(() => cart().changeQty(latte.key, 3))
    expect(rows(), 'changeQty 只改那一列').toEqual(['可頌/M/normal×20@70', '拿鐵/L/less×3@130'])
    expect(before.lines[1].quantity, '舊的列物件不能被改到：用 { ...line, quantity } 建新的').toBe(1)
    act(() => cart().changeQty(latte.key, 99))
    expect(rows()[1], 'changeQty 超過 20 當成 20').toBe('拿鐵/L/less×20@130')
    act(() => cart().changeQty(latte.key, 0))
    expect(rows(), 'changeQty(key, 0) 要移除那一列').toEqual(['可頌/M/normal×20@70'])
  })

  test('selectCount、selectSubtotal；clear 之後 action 還能用', () => {
    act(() => { cart().add(LATTE, { size: 'L', sugar: 'normal' }); cart().add(CROISSANT, { size: 'M', sugar: 'normal' }); cart().add(CROISSANT, { size: 'M', sugar: 'normal' }) })
    expect(selectCount(cart()), '件數是數量總和').toBe(3)
    expect(selectSubtotal(cart()), '小計是單價 × 數量：130 + 70 × 2').toBe(270)
    act(() => cart().clear())
    expect(cart().lines).toEqual([])
    act(() => cart().add(LATTE, { size: 'M', sugar: 'normal' }))
    expect(rows(), 'clear 之後 add 還要能用').toEqual(['拿鐵/M/normal×1@110'])
  })

  test('寫進 localStorage 的 cart：格式是 { state: { lines }, version: 1 }', () => {
    act(() => cart().add(LATTE, { size: 'M', sugar: 'less' }))
    const saved = stored()
    expect(saved, 'add 之後 localStorage 要有 cart：用 persist 包住 store，name 是 \'cart\'').not.toBeNull()
    expect(saved.version, 'version 要是 1：第一版就給版本號，之後改格式才分得出舊資料').toBe(1)
    expect(saved.state.lines.map((l: CartLine) => l.name), '存的是 lines').toEqual(['拿鐵'])
  })

  test('重新整理後讀回合法的購物車', () => {
    reload(JSON.stringify({ state: { lines: [LINE] }, version: 1 }))
    expect(rows(), '合法的資料要讀回來').toEqual(['拿鐵/M/less×2@110'])
    act(() => cart().add(LATTE, { size: 'M', sugar: 'less' }))
    expect(rows(), '讀回來之後 action 照常可以用').toEqual(['拿鐵/M/less×3@110'])
  })

  test('storage 裡的壞資料不能讓 app 當掉：整個不用，從空車開始', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cases: [string, string][] = [
      ['lines 是 null', JSON.stringify({ state: { lines: null }, version: 1 })],
      ['某一列數量是 -3', JSON.stringify({ state: { lines: [{ ...LINE, quantity: -3 }] }, version: 1 })],
      ['某一列少了 name', JSON.stringify({ state: { lines: [{ ...LINE, name: undefined }] }, version: 1 })],
      ['舊版本（version 0）的資料', JSON.stringify({ state: { lines: [LINE] }, version: 0 })],
      ['JSON 壞掉', '{"state": {"lines": ['],
    ]
    for (const [what, raw] of cases) {
      expect(() => reload(raw), `${what}：讀取時不能丟錯`).not.toThrow()
      expect(cart().lines, `${what}：要從空車開始。persist 不會驗證內容，在 merge 裡用 persistedCartSchema.safeParse 檢查，不合法就回傳目前的 state`).toEqual([])
      expect(() => selectCount(cart()), `${what}：selectCount 不能壞掉`).not.toThrow()
    }
  })

  test('CartBadge 顯示件數，件數沒變就不重新 render', () => {
    const counter = renderCounter()
    render(<counter.Profile id="badge"><CartBadge /></counter.Profile>)
    expect(screen.getByText(/^購物車/)).toHaveTextContent('購物車 0 件')
    act(() => { cart().add(LATTE, { size: 'M', sugar: 'normal' }); cart().add(LATTE, { size: 'M', sugar: 'normal' }) })
    expect(screen.getByText(/^購物車/), '加入兩杯之後顯示 2 件').toHaveTextContent('購物車 2 件')
    counter.reset()
    act(() => useCartStore.setState({ lines: [...cart().lines] }))
    expect(counter.commits('badge'), 'lines 換了新陣列但件數沒變，CartBadge 卻重新 render 了：用 useCartStore(selectCount) 只訂閱件數，不要拿整個 state').toBe(0)
  })
})
