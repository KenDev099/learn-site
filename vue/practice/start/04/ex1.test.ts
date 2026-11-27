import { describe, expect, test } from 'vitest'
import { computed, isReactive, isRef, unref } from 'vue'
import { useCart } from './ex1.ts'

const latte = { id: 2, name: '拿鐵', price: 110 }
const croissant = { id: 5, name: '可頌', price: 70 }

describe('練習 1：useCart 解構後仍有響應性', () => {
  test('count 要是 ref', () => {
    const { count } = useCart()
    expect(isRef(count), 'count 是普通數字：解構 reactive 物件會拿到當下的值，要用 toRefs 或 toRef 把屬性轉成 ref').toBe(true)
  })

  test('解構後 add() 兩次，count.value 是 2、items 有 2 筆', () => {
    const { items, count, add } = useCart()
    add(latte)
    add(croissant)
    expect(isRef(count) ? count.value : count, 'add() 之後 count 沒有跟著變：回傳的 count 跟 state.count 斷線了').toBe(2)
    expect(unref(items).map(i => i.name), 'items 要是同一份購物車的品項').toEqual(['拿鐵', '可頌'])
  })

  test('依賴 count 的 computed 會重新計算', () => {
    const { count, add } = useCart()
    const label = computed(() => `購物車（${unref(count)}）`)
    expect(label.value).toBe('購物車（0）')
    add(latte)
    expect(label.value, 'computed 沒有重算：count 要是連回 state 的 ref，讀 .value 才會被追蹤').toBe('購物車（1）')
  })

  test('items 要是 ref 或 reactive 陣列，依賴它的 computed 會重新計算', () => {
    const { items, add } = useCart()
    expect(isRef(items) || isReactive(items), 'items 是普通陣列：Vue 追蹤不到它的變化，要回傳 toRefs(state).items 或 state.items（reactive 陣列）').toBe(true)
    const total = computed(() => unref(items).reduce((sum, i) => sum + i.price, 0))
    expect(total.value).toBe(0)
    add(latte)
    add(croissant)
    expect(total.value, '依賴 items 的 computed 沒有重算：items 要連回 state 的響應式陣列').toBe(180)
  })

  test('每次呼叫 useCart() 各自一份購物車', () => {
    const a = useCart()
    const b = useCart()
    a.add(latte)
    expect(unref(b.count), '兩個購物車互相影響：狀態要在 useCart() 裡面建立').toBe(0)
  })
})
