import { describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createMemoryHistory, createRouter } from 'vue-router'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { SHOP_API, ValidationError, type CheckoutInput } from './shared/api.ts'
import { useCartStore, type CartLine } from './features/cart/cart-store.ts'
import CheckoutPage from './features/checkout/CheckoutPage.vue'

const LINES: CartLine[] = [
  { key: '2-L-less', productId: 2, name: '拿鐵', size: 'L', sugar: 'less', unitPrice: 130, qty: 1 },
  { key: '5-M-normal', productId: 5, name: '可頌', size: 'M', sugar: 'normal', unitPrice: 70, qty: 2 },
]

async function setup() {
  const pending: Deferred<{ id: number }>[] = []
  const createOrder = vi.fn((_input: CheckoutInput, _key: string) => {
    const d = deferred<{ id: number }>()
    pending.push(d)
    return d.promise
  })
  let n = 0
  const newKey = vi.fn(() => `key-${++n}`)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/checkout', name: 'checkout', component: CheckoutPage, props: { newKey } },
      { path: '/orders/:id', name: 'order-status', component: { template: '<p class="status-page">訂單狀態</p>' } },
    ],
  })
  router.push('/checkout')
  await router.isReady()
  const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { cart: { lines: structuredClone(LINES) } } })
  const wrapper = mount({ template: '<RouterView />' }, {
    global: { plugins: [router, pinia], provide: { [SHOP_API as symbol]: { createOrder } } },
  })
  const cart = useCartStore()
  const input = (name: string) => wrapper.find(`input[name="${name}"]`)
  const errorOf = (name: string) => input(name).element.closest('.field')?.querySelector('.error')?.textContent ?? null
  async function fillValid() {
    await input('phone').setValue('0912345678')
    await input('pickupTime').setValue('08:30')
  }
  const submit = () => wrapper.find('form').trigger('submit')
  return { wrapper, router, cart, createOrder, newKey, pending, input, errorOf, fillValid, submit }
}

describe('練習 3：結帳頁', () => {
  test('錯誤在 blur 或按過送出之後才顯示；驗證沒過不送出', async () => {
    const { wrapper, input, errorOf, submit, createOrder } = await setup()
    expect(errorOf('phone'), '一打開頁面不能就顯示錯誤').toBeNull()
    await input('phone').setValue('12')
    expect(errorOf('phone'), '還在輸入（還沒 blur）不要顯示錯誤').toBeNull()
    await input('phone').trigger('blur')
    expect(errorOf('phone'), 'blur 之後要在同一個 .field 的 <p class="error"> 顯示錯誤').toBe('手機要是 09 開頭的 10 位數字')
    expect(input('phone').attributes('aria-invalid'), '有錯的欄位要 aria-invalid="true"').toBe('true')
    const describedby = input('phone').attributes('aria-describedby')
    expect(describedby, '有錯的欄位要有 aria-describedby，指向錯誤訊息').toBeTruthy()
    expect(wrapper.find(`[id="${describedby}"]`).text(), 'aria-describedby 要指向顯示錯誤訊息的元素').toBe('手機要是 09 開頭的 10 位數字')
    expect(errorOf('pickupTime'), '沒碰過的欄位不顯示錯誤').toBeNull()
    await submit()
    expect(errorOf('pickupTime'), '按過送出之後，所有欄位的錯誤都要顯示').toBe('取餐時間格式要是 HH:mm')
    expect(createOrder, '前端驗證沒過就不要送出').not.toHaveBeenCalled()
  })

  test('送出進行中再觸發 submit 不會重送', async () => {
    const { fillValid, submit, createOrder, newKey } = await setup()
    await fillValid()
    expect(newKey, '冪等鍵在第一次送出時才產生，不要在元件建立時就產生').not.toHaveBeenCalled()
    await submit()
    await submit()
    await submit()
    expect(createOrder, '進行中要在 onSubmit 開頭擋掉：disabled 只擋得住點按鈕，擋不住快捷鍵或程式觸發的 submit 事件').toHaveBeenCalledTimes(1)
  })

  test('失敗：購物車不變、留在結帳頁；重送沿用同一個冪等鍵', async () => {
    const { wrapper, router, cart, fillValid, submit, createOrder, newKey, pending } = await setup()
    await fillValid()
    await submit()
    pending[0].reject(new Error('連線逾時'))
    await flushPromises()
    expect(wrapper.find('.form-error').exists(), '其他錯誤要顯示在 .form-error').toBe(true)
    expect(cart.clear, '送出失敗不能清空購物車（不要寫在 finally）').not.toHaveBeenCalled()
    expect(router.currentRoute.value.name, '失敗要留在結帳頁').toBe('checkout')
    await submit()
    expect(createOrder).toHaveBeenCalledTimes(2)
    expect(createOrder.mock.calls[1][1], '失敗重送要沿用第一次的冪等鍵，伺服器才認得出是同一筆').toBe(createOrder.mock.calls[0][1])
    expect(newKey, '同一次結帳只能產生一個冪等鍵').toHaveBeenCalledTimes(1)
  })

  test('422：fieldErrors 顯示在對應欄位', async () => {
    const { cart, errorOf, input, fillValid, submit, pending } = await setup()
    await fillValid()
    await submit()
    pending[0].reject(new ValidationError({ pickupTime: ['這個時段已額滿'] }))
    await flushPromises()
    expect(errorOf('pickupTime'), 'ValidationError 的 fieldErrors 要顯示在對應的欄位').toBe('這個時段已額滿')
    expect(input('pickupTime').attributes('aria-invalid')).toBe('true')
    expect(errorOf('phone')).toBeNull()
    expect(cart.clear).not.toHaveBeenCalled()
  })

  test('成功：送出購物車內容、清空購物車、導到訂單狀態頁', async () => {
    const { router, cart, fillValid, submit, createOrder, pending } = await setup()
    await fillValid()
    await submit()
    const [input, key] = createOrder.mock.calls[0]
    expect(key).toBe('key-1')
    expect(input.phone).toBe('0912345678')
    expect(input.pickupTime).toBe('08:30')
    expect(input.lines, 'lines 是購物車的每一列，去掉 key 欄位').toEqual(LINES.map(({ key: _k, ...l }) => l))
    pending[0].resolve({ id: 42 })
    await flushPromises()
    expect(cart.clear, '成功之後要清空購物車').toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath, '成功之後要導到 { name: "order-status", params: { id } }').toBe('/orders/42')
  })
})
