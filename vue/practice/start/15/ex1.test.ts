import { beforeEach, describe, expect, test } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { useCartStore } from './cart-store.ts'

const product = (id: number) => PRODUCTS.find(p => p.id === id)!
const LATTE = product(2)
const CROISSANT = product(5)

describe('練習 1：購物車 store', () => {
  // 每個測試一個全新的 pinia：store 不會帶著上一個測試的資料
  beforeEach(() => setActivePinia(createPinia()))

  test('拿鐵加兩次、可頌加一次：兩列，共 3 個，小計 290', () => {
    const cart = useCartStore()
    cart.add(LATTE)
    cart.add(LATTE)
    cart.add(CROISSANT)
    expect(cart.items.length, '同一個商品加兩次變成兩列：add 要先找有沒有同 id 的明細，有就把 qty 加一').toBe(2)
    expect(cart.items.find(i => i.id === 2)?.qty, '拿鐵加了兩次，qty 要是 2').toBe(2)
    expect(cart.count, 'count 要是所有 qty 的總和，不是明細的列數').toBe(3)
    expect(cart.subtotal, 'subtotal 要是 price × qty 的總和：110×2 + 70 = 290').toBe(290)
  })

  test('明細只有 { id, name, price, qty }，不改到傳進來的商品', () => {
    const cart = useCartStore()
    // 商品資料是凍結的：add 如果直接改它（例如把 qty 寫進商品物件），會丟 TypeError
    const latte = deepFreeze({ ...LATTE })
    expect(() => { cart.add(latte); cart.add(latte) }, 'add 改到了傳進來的商品物件：要建立一個新的明細物件 { id, name, price, qty: 1 }，不要把商品本身放進車裡再改它').not.toThrow()
    expect(cart.items, '明細要剛好是 { id, name, price, qty }：不要把商品的其他欄位（例如 category）一起放進來').toEqual([{ id: 2, name: '拿鐵', price: 110, qty: 2 }])
  })

  test('數量上限 20', () => {
    const cart = useCartStore()
    for (let i = 0; i < 25; i++) cart.add(LATTE)
    expect(cart.items[0]?.qty, '加了 25 次，qty 要停在上限 20').toBe(20)
    cart.changeQty(2, 99)
    expect(cart.items[0]?.qty, 'changeQty 超過 20 要當成 20').toBe(20)
  })

  test('changeQty 改數量；0 或負數就移除那一列', () => {
    const cart = useCartStore()
    cart.add(LATTE)
    cart.add(CROISSANT)
    cart.changeQty(2, 5)
    expect(cart.items.find(i => i.id === 2)?.qty, 'changeQty(2, 5) 之後拿鐵的 qty 要是 5').toBe(5)
    expect(cart.subtotal, '110×5 + 70 = 620').toBe(620)
    cart.changeQty(2, 0)
    expect(cart.items.map(i => i.id), 'changeQty(id, 0) 要把那一列移除，不能留下 qty 0 的明細').toEqual([5])
    cart.changeQty(5, -1)
    expect(cart.items, '負數也要移除').toEqual([])
    expect(cart.count).toBe(0)
  })

  test('所有 state 都有回傳：store.$state 裡有 items 和 orderType', () => {
    const cart = useCartStore()
    cart.add(LATTE)
    expect(Object.keys(cart.$state).sort(), 'store.$state 少了 state：setup store 要把每一個 ref 都放進 return，否則 devtools、外掛、SSR 都看不到').toEqual(['items', 'orderType'])
    expect(cart.$state.items.length, '$state.items 要是同一份明細').toBe(1)
  })

  test('$reset() 讓所有 state 回到初始值', () => {
    const cart = useCartStore()
    cart.add(LATTE)
    cart.setOrderType('togo')
    cart.$reset()
    expect(cart.items, '$reset 之後要是空車').toEqual([])
    expect(cart.orderType, '$reset 之後 orderType 要回到 here：每一個 state 都要重設').toBe('here')
    expect(cart.count).toBe(0)
  })

  test('換一個 pinia 就是另一台購物車', () => {
    useCartStore().add(LATTE)
    setActivePinia(createPinia())
    expect(useCartStore().items, '新的 pinia 卻看到上一台車的商品：狀態要寫在 defineStore 的 setup 函式裡面，不要放在模組最外層').toEqual([])
  })
})
