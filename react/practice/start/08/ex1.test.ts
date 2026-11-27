import { describe, expect, test } from 'vitest'
import { cartReducer, cartTotal, EMPTY_CART, MAX_QUANTITY, type CartLine, type CartState } from './cartReducer.ts'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { typecheck } from '../../helpers/typecheck.ts'

const [americano, latte, , tea, croissant] = PRODUCTS as Product[]
const matcha: Product = { id: 9, name: '抹茶拿鐵', price: 130, category: 'tea' }   // 不在範例菜單裡的商品
const line = (p: Product, quantity: number): CartLine => ({ productId: p.id, name: p.name, price: p.price, quantity })
// 測試給 reducer 的 state 與 action 都是凍結的：改了任何一層就會丟 TypeError
const cart = (lines: CartLine[] = [], coupon: string | null = null): CartState => deepFreeze({ lines, coupon })
const run = (state: CartState, action: object): CartState => cartReducer(state, deepFreeze(action) as never)
const FROZEN = '（state 是凍結的：不能 push、不能改 quantity，要回傳新的物件與陣列）'

describe('練習 1：cartReducer 是純函式', () => {
  test('added：購物車沒有這個商品時，在最後面加一列，數量 1', () => {
    expect(run(cart(), { type: 'added', product: latte }), `空的購物車加入拿鐵 ${FROZEN}`).toEqual({ lines: [line(latte, 1)], coupon: null })
    const state = cart([line(latte, 2)], 'LATTE20')
    expect(run(state, { type: 'added', product: matcha }), '新的商品加在最後面，productId、name、price 從 action.product 來，coupon 保留')
      .toEqual({ lines: [line(latte, 2), line(matcha, 1)], coupon: 'LATTE20' })
  })

  test('added：已經有這個商品時數量 +1，不會多一列', () => {
    const state = cart([line(americano, 1), line(latte, 2)])
    expect(run(state, { type: 'added', product: latte }), '拿鐵已經在購物車裡：數量從 2 變 3，還是兩列').toEqual({ lines: [line(americano, 1), line(latte, 3)], coupon: null })
  })

  test('incremented／decremented：數量 +1／−1', () => {
    const state = cart([line(tea, 3), line(croissant, 5)])
    expect(run(state, { type: 'incremented', productId: croissant.id }).lines, '可頌 5 → 6，伯爵紅茶不變').toEqual([line(tea, 3), line(croissant, 6)])
    expect(run(state, { type: 'decremented', productId: tea.id }).lines, '伯爵紅茶 3 → 2，可頌不變').toEqual([line(tea, 2), line(croissant, 5)])
  })

  test('decremented：數量是 1 時把那一列移除，不能留下數量 0 的列', () => {
    const state = cart([line(tea, 1), line(croissant, 5)])
    expect(run(state, { type: 'decremented', productId: tea.id }).lines, '數量 1 再減就是移除').toEqual([line(croissant, 5)])
  })

  test(`數量上限是 ${MAX_QUANTITY}：到上限時 added、incremented 回傳原本的 state`, () => {
    const state = cart([line(latte, MAX_QUANTITY)])
    expect(run(state, { type: 'added', product: latte }), 'added：已經 20 杯，回傳原本的 state（同一個參考）').toBe(state)
    expect(run(state, { type: 'incremented', productId: latte.id }), 'incremented：已經 20 杯，回傳原本的 state（同一個參考）').toBe(state)
    expect(run(cart([line(latte, MAX_QUANTITY - 1)]), { type: 'incremented', productId: latte.id }).lines, '19 → 20 是可以的').toEqual([line(latte, MAX_QUANTITY)])
  })

  test('removed：移除那一列；cleared：清空', () => {
    const state = cart([line(americano, 1), line(latte, 2), line(matcha, 1)])
    expect(run(state, { type: 'removed', productId: latte.id }).lines, '只移除拿鐵').toEqual([line(americano, 1), line(matcha, 1)])
    expect(run(state, { type: 'cleared' }), 'cleared 之後 lines 是 []、coupon 是 null').toEqual({ lines: [], coupon: null })
  })

  test('coupon_applied：購物車有東西才套用；空字串不套用', () => {
    const state = cart([line(latte, 1)])
    expect(run(state, { type: 'coupon_applied', code: 'LATTE20' }), '套用後 coupon 是 action.code，lines 不變').toEqual({ lines: [line(latte, 1)], coupon: 'LATTE20' })
    expect(run(cart([line(latte, 1)], 'LATTE20'), { type: 'coupon_applied', code: 'TEA10' }).coupon, '可以換成另一個折扣碼').toBe('TEA10')
    const empty = cart()
    expect(run(empty, { type: 'coupon_applied', code: 'LATTE20' }), '空的購物車不能套用折扣碼：回傳原本的 state').toBe(empty)
    expect(run(state, { type: 'coupon_applied', code: '' }), 'code 是空字串：回傳原本的 state').toBe(state)
  })

  test('lines 變成空的時候，coupon 要一起變回 null', () => {
    const state = cart([line(latte, 1)], 'LATTE20')
    for (const action of [{ type: 'removed', productId: latte.id }, { type: 'decremented', productId: latte.id }, { type: 'cleared' }])
      expect(run(state, action), `${action.type} 讓購物車變空：折扣碼不能留著（這條規則只寫在 reducer 裡，每一種 action 都要顧到）`).toEqual({ lines: [], coupon: null })
    const two = cart([line(latte, 1), line(tea, 1)], 'LATTE20')
    expect(run(two, { type: 'removed', productId: latte.id }).coupon, '還有別的商品時折扣碼要留著').toBe('LATTE20')
  })

  test('什麼都沒變時回傳原本的 state（同一個參考）', () => {
    const state = cart([line(latte, 2)], 'LATTE20')
    const same = '回傳原本的 state：React 用 Object.is 比較，參考一樣才會跳過更新'
    expect(run(state, { type: 'incremented', productId: 99 }), `incremented 找不到 productId 99：${same}`).toBe(state)
    expect(run(state, { type: 'decremented', productId: 99 }), `decremented 找不到 productId 99：${same}`).toBe(state)
    expect(run(state, { type: 'removed', productId: 99 }), `removed 找不到 productId 99：${same}`).toBe(state)
    expect(run(state, { type: 'coupon_applied', code: 'LATTE20' }), `套用已經套用的折扣碼：${same}`).toBe(state)
    const empty = cart()
    expect(run(empty, { type: 'cleared' }), `空的購物車再清空：${same}`).toBe(empty)
  })

  test('有變的那一層換新的參考，沒變的那幾列沿用原本的物件', () => {
    const state = cart([line(americano, 1), line(latte, 2), line(tea, 1)])
    const next = run(state, { type: 'incremented', productId: latte.id })
    expect(next, 'state 有變：要回傳新的物件').not.toBe(state)
    expect(next.lines, 'lines 有變：要是新的陣列').not.toBe(state.lines)
    expect(next.lines[1], '拿鐵那一列有變：要是新的物件').not.toBe(state.lines[1])
    expect(next.lines[0], '美式咖啡那一列沒變：沿用原本的物件，不要整包深複製').toBe(state.lines[0])
    expect(next.lines[2], '伯爵紅茶那一列沒變：沿用原本的物件，不要整包深複製').toBe(state.lines[2])
    const added = run(state, { type: 'added', product: matcha })
    expect(added.lines.slice(0, 3).every((l, i) => l === state.lines[i]), '加一列新的商品：原本三列都沿用原本的物件').toBe(true)
  })

  test('同樣的 state 與 action 呼叫兩次，結果一樣；EMPTY_CART 沒有被改到', () => {
    const state = cart([line(latte, 2)])
    const action = { type: 'added', product: croissant }
    expect(run(state, action), 'reducer 是純函式：React 在 StrictMode 會呼叫它兩次，兩次的結果要一樣').toEqual(run(state, action))
    expect(state, '傳進來的 state 不能被改').toEqual({ lines: [line(latte, 2)], coupon: null })
    cartReducer(EMPTY_CART, { type: 'added', product: latte } as never)
    expect(EMPTY_CART, 'EMPTY_CART 是共用的初始值：reducer 改了它，之後每個購物車一開始就有東西').toEqual({ lines: [], coupon: null })
  })

  test('一連串 action 用 reduce 重播，得到最後的購物車與總金額', () => {
    const actions = [
      { type: 'added', product: latte }, { type: 'added', product: croissant }, { type: 'added', product: latte },
      { type: 'coupon_applied', code: 'LATTE20' }, { type: 'incremented', productId: croissant.id },
      { type: 'decremented', productId: latte.id }, { type: 'added', product: matcha }, { type: 'removed', productId: croissant.id },
    ]
    const final = actions.reduce(run, cart())
    expect(final, '拿鐵 1、抹茶拿鐵 1，折扣碼 LATTE20').toEqual({ lines: [line(latte, 1), line(matcha, 1)], coupon: 'LATTE20' })
    expect(cartTotal(final), '總金額 110 + 130').toBe(240)
  })

  test('CartAction 是可辨識聯合型別：打錯 type、少帶欄位都要是型別錯誤', { timeout: 30_000 }, () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex1.usage.ts': `
import { cartReducer, EMPTY_CART, type CartAction, type CartState } from './cartReducer.ts'
import { PRODUCTS } from '../../helpers/fake-api.ts'

const actions: CartAction[] = [
  { type: 'added', product: PRODUCTS[0]! },
  { type: 'incremented', productId: 2 },
  { type: 'decremented', productId: 2 },
  { type: 'removed', productId: 2 },
  { type: 'cleared' },
  { type: 'coupon_applied', code: 'LATTE20' },
]
const next: CartState = actions.reduce(cartReducer, EMPTY_CART)
function codeOf(action: CartAction): string | null {
  return action.type === 'coupon_applied' ? action.code : null
}
// @ts-expect-error 沒有 typo 這種 action
cartReducer(next, { type: 'typo' })
// @ts-expect-error added 一定要帶 product
cartReducer(next, { type: 'added' })
// @ts-expect-error productId 是 number
cartReducer(next, { type: 'removed', productId: '2' })
// @ts-expect-error cleared 沒有其他欄位
cartReducer(next, { type: 'cleared', productId: 2 })
// @ts-expect-error coupon_applied 帶的是 code
cartReducer(next, { type: 'coupon_applied', coupon: 'LATTE20' })
export { codeOf }
`,
    })
    expect(errors, 'CartAction 要寫成六種 action 的聯合型別（不能是 any）：正確的 action 都能傳，錯的每一行都要報錯。「Unused @ts-expect-error」代表那一行本來該報錯卻沒有').toBe('')
  })
})
