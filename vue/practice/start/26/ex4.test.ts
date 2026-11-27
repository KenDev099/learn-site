import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { SHOP_API, type Order, type OrderStatus } from './shared/api.ts'
import OrderStatusPage from './features/orders/OrderStatusPage.vue'

let visibility: DocumentVisibilityState = 'visible'
beforeEach(() => {
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  delete (document as { visibilityState?: unknown }).visibilityState
})
function setVisibility(v: DocumentVisibilityState) {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

const order = (status: OrderStatus, lines: Order['lines'] = [
  { productId: 2, name: '拿鐵', size: 'L', sugar: 'less', qty: 1, unitPrice: 130 },
]): Order => ({ id: 42, storeId: 1, customerId: 1, status, lines })

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

function setup() {
  vi.useFakeTimers()
  const pending: { d: Deferred<Order>; signal?: AbortSignal }[] = []
  const getOrder = vi.fn((_id: number, opts: { signal?: AbortSignal } = {}) => {
    const d = deferred<Order>()
    pending.push({ d, signal: opts.signal })
    return d.promise
  })
  const errorHandler = vi.fn()
  const wrapper = mount(OrderStatusPage, {
    props: { orderId: 42 },
    global: { provide: { [SHOP_API as symbol]: { getOrder } }, config: { errorHandler } },
  })
  const status = () => wrapper.find('.status').text()
  const retryButton = () => wrapper.findAll('button').find(b => b.text().includes('重試'))
  return { wrapper, getOrder, pending, errorHandler, status, retryButton }
}

describe('練習 4：訂單狀態頁', () => {
  test('一進頁面就查；回來之後 5 秒再查；慢的時候不重疊', async () => {
    const { getOrder, pending, status } = setup()
    expect(getOrder, '一進頁面就要查一次').toHaveBeenCalledTimes(1)
    expect(getOrder.mock.calls[0][0]).toBe(42)
    expect(pending[0].signal, '要把 signal 傳給 getOrder，離開頁面時才能 abort').toBeInstanceOf(AbortSignal)
    await advance(20_000)
    expect(getOrder, '第一個請求還沒回來就又送了：不要用 setInterval，請求結束後才用 setTimeout 排下一次').toHaveBeenCalledTimes(1)
    pending[0].d.resolve(order('brewing'))
    await advance(0)
    expect(status()).toBe('製作中')
    await advance(4999)
    expect(getOrder).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(getOrder, '上一次回來後 5 秒要再查').toHaveBeenCalledTimes(2)
  })

  test('分頁隱藏時暫停、不留計時器；回來時立刻查', async () => {
    const { getOrder, pending } = setup()
    pending[0].d.resolve(order('received'))
    await advance(0)
    setVisibility('hidden')
    expect(vi.getTimerCount(), '分頁隱藏時要清掉排好的計時器').toBe(0)
    await advance(60_000)
    expect(getOrder, 'document.visibilityState 是 hidden 時不要查').toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await advance(0)
    expect(getOrder, '監聽 visibilitychange，回到前景時立刻查一次').toHaveBeenCalledTimes(2)
  })

  test('請求進行中切到背景：回來後不排計時器；回到前景立刻查', async () => {
    const { getOrder, pending } = setup()
    setVisibility('hidden')
    pending[0].d.resolve(order('brewing'))
    await advance(0)
    expect(vi.getTimerCount(), '請求回來時分頁是隱藏的，就不要排下一次（回到前景時再查）').toBe(0)
    await advance(60_000)
    expect(getOrder).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await advance(0)
    expect(getOrder, '回到前景時要立刻查一次').toHaveBeenCalledTimes(2)
  })

  test('ready 之後停止', async () => {
    const { getOrder, pending, status } = setup()
    pending[0].d.resolve(order('ready'))
    await advance(0)
    expect(status()).toBe('可以取餐了')
    expect(vi.getTimerCount(), 'ready 之後不能再排計時器').toBe(0)
    await advance(60_000)
    setVisibility('hidden')
    setVisibility('visible')
    await advance(60_000)
    expect(getOrder, 'ready 之後不能再查（也要移除 visibilitychange 的監聽）').toHaveBeenCalledTimes(1)
  })

  test('查詢失敗：顯示錯誤與重試；重試成功後恢復輪詢', async () => {
    const { wrapper, getOrder, pending, retryButton, status } = setup()
    pending[0].d.reject(new Error('503'))
    await advance(0)
    expect(wrapper.find('.poll-error[role="alert"]').exists(), '查詢失敗要顯示 <p role="alert" class="poll-error">：計時器裡的錯誤 Vue 攔不到，要由輪詢自己存起來').toBe(true)
    expect(retryButton(), '查詢失敗要有「重試」按鈕').toBeDefined()
    const before = getOrder.mock.calls.length
    await retryButton()!.trigger('click')
    expect(getOrder.mock.calls.length, '按重試要立刻再查一次').toBe(before + 1)
    pending.at(-1)!.d.resolve(order('brewing'))
    await advance(0)
    expect(wrapper.find('.poll-error').exists(), '成功之後錯誤訊息要消失').toBe(false)
    expect(status()).toBe('製作中')
    await advance(5000)
    expect(getOrder.mock.calls.length, '重試成功後要恢復每 5 秒的輪詢').toBe(before + 2)
  })

  test('離開頁面：清掉計時器、abort 進行中的請求', async () => {
    const { wrapper, pending } = setup()
    pending[0].d.resolve(order('brewing'))
    await advance(5000)
    expect(pending).toHaveLength(2)
    wrapper.unmount()
    expect(vi.getTimerCount(), '卸載之後不能留下計時器').toBe(0)
    expect(pending[1].signal?.aborted, '卸載時要 abort 進行中的請求').toBe(true)
  })

  test('明細渲染出錯：只有明細換成替代畫面，錯誤不會傳到 app 的 errorHandler', async () => {
    const { wrapper, pending, errorHandler, status } = setup()
    const broken = order('brewing', [{ productId: 2, size: 'M', sugar: 'none', qty: 1, unitPrice: 110 } as Order['lines'][number]])
    pending[0].d.resolve(broken)
    await advance(0)
    expect(errorHandler, '明細的渲染錯誤傳到了 app.config.errorHandler：用 shared/ui/ErrorBoundary.vue 把 OrderDetails 包起來').not.toHaveBeenCalled()
    expect(wrapper.find('.boundary-fallback').exists(), '明細出錯時要顯示錯誤邊界的替代畫面').toBe(true)
    expect(status(), '明細壞掉，狀態還是要照常顯示').toBe('製作中')
  })
})
