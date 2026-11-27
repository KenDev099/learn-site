import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import CartSummary from './CartSummary.vue'
import { useCartStore, type CartItem } from './cart-store.ts'

// 記錄元件有沒有自己 createPinia()：測試用的 pinia 啟用時，useCartStore(另一個 pinia) 會被忽略，
// 畫面照樣正確，所以直接檢查呼叫
vi.mock('pinia', async importOriginal => {
  const real = await importOriginal<typeof import('pinia')>()
  return { ...real, createPinia: vi.fn(real.createPinia) }
})

const LATTE: CartItem = { id: 2, name: '拿鐵', price: 110, qty: 2 }
const CROISSANT: CartItem = { id: 5, name: '可頌', price: 70, qty: 1 }

function setup(items: CartItem[]) {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // createSpy: vi.fn 一定要給（沒有開 Vitest globals 時不給會丟錯）；action 預設被換成假的 spy
  const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { cart: { items } } })
  vi.mocked(createPinia).mockClear()
  const wrapper = mount(CartSummary, { global: { plugins: [pinia] } })
  return { wrapper, cart: useCartStore() }
}

describe('練習 2：CartSummary 用 storeToRefs 讀 store', () => {
  test('一開始顯示 initialState 的數量與小計', () => {
    const { wrapper } = setup([LATTE, CROISSANT])
    expect(wrapper.text(), '要顯示「共 3 個，小計 290 元」：數字從測試給的 pinia 來，不要在元件裡 createPinia()').toContain('共 3 個，小計 290 元')
  })

  test('元件不自己建立 pinia', () => {
    setup([LATTE])
    expect(vi.mocked(createPinia), '元件裡呼叫了 createPinia()：那是另一個 pinia、另一台空的購物車。直接 useCartStore()，它會 inject app.use(pinia) 裝的那一個').not.toHaveBeenCalled()
  })

  test('store 變動之後畫面跟著更新', async () => {
    const { wrapper, cart } = setup([LATTE])
    cart.$patch({ items: [LATTE, CROISSANT, { id: 6, name: '起司蛋糕', price: 120, qty: 1 }] })
    await nextTick()
    expect(wrapper.text(), '購物車變了，畫面還是舊的：直接解構 store 拿到的是當下的值，count、subtotal 要用 storeToRefs(store) 取出').toContain('共 4 個，小計 410 元')
  })

  test('按「清空」呼叫 clear() 一次', async () => {
    const { wrapper, cart } = setup([LATTE])
    await wrapper.get('button').trigger('click')
    expect(vi.mocked(cart.clear), '按清空要呼叫 store 的 clear()：action 直接從 store 解構，不要從 storeToRefs 拿').toHaveBeenCalledTimes(1)
  })
})
