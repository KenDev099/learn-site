import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { useOrderPolling, type OrderStatus } from './useOrderPolling.ts'

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

function setup() {
  vi.useFakeTimers()
  const pending: Deferred<OrderStatus>[] = []
  const getOrderStatus = vi.fn((_id: number, _opts?: { signal?: AbortSignal }) => {
    const d = deferred<OrderStatus>()
    pending.push(d)
    return d.promise
  })
  const scope = effectScope()
  const r = scope.run(() => useOrderPolling(42, { getOrderStatus }))!
  return { r, scope, pending, getOrderStatus }
}
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('練習 4：輪詢訂單狀態', () => {
  test('一建立就查；回來之後 5 秒再查', async () => {
    const { r, pending, getOrderStatus } = setup()
    expect(getOrderStatus, '一建立就要查一次').toHaveBeenCalledTimes(1)
    expect(getOrderStatus.mock.calls[0][0]).toBe(42)
    pending[0].resolve('received')
    await advance(0)
    expect(r.status.value).toBe('received')
    await advance(4999)
    expect(getOrderStatus).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(getOrderStatus, '上一次回來後 5 秒要再查').toHaveBeenCalledTimes(2)
  })

  test('請求很慢時不重疊：上一次結束後才排下一次', async () => {
    const { pending, getOrderStatus } = setup()
    await advance(20_000)
    expect(getOrderStatus, '第一個請求還沒回來就又送了：不要用 setInterval，請求結束後才用 setTimeout 排下一次').toHaveBeenCalledTimes(1)
    pending[0].resolve('brewing')
    await advance(5000)
    expect(getOrderStatus).toHaveBeenCalledTimes(2)
  })

  test('失敗時存 error 並繼續輪詢，成功後 error 清回 null', async () => {
    const { r, pending, getOrderStatus } = setup()
    pending[0].reject(new Error('伺服器忙碌'))
    await advance(0)
    expect(r.error.value?.message).toBe('伺服器忙碌')
    await advance(5000)
    expect(getOrderStatus, '失敗之後也要排下一次').toHaveBeenCalledTimes(2)
    pending[1].resolve('brewing')
    await advance(0)
    expect(r.error.value).toBe(null)
  })

  test('頁面隱藏時暫停，回來時立刻查一次', async () => {
    const { pending, getOrderStatus } = setup()
    pending[0].resolve('received')
    await advance(0)
    setVisibility('hidden')
    expect(vi.getTimerCount(), '頁面隱藏時要清掉排好的計時器').toBe(0)
    await advance(60_000)
    expect(getOrderStatus, '頁面隱藏（document.visibilityState === \'hidden\'）時不要查').toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await advance(0)
    expect(getOrderStatus, '監聽 visibilitychange，回到前景時立刻查一次').toHaveBeenCalledTimes(2)
    pending[1].resolve('brewing')
    await advance(5000)
    expect(getOrderStatus, '回到前景之後繼續每 5 秒查').toHaveBeenCalledTimes(3)
  })

  test('請求進行中切到背景：回來之後不排計時器，回到前景才查', async () => {
    const { pending, getOrderStatus } = setup()
    setVisibility('hidden')
    pending[0].resolve('received')
    await advance(0)
    expect(vi.getTimerCount(), '請求回來時頁面是隱藏的，就不要排下一次（檢查 document.visibilityState 再 setTimeout）').toBe(0)
    await advance(60_000)
    expect(getOrderStatus, '頁面隱藏時不要查').toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await advance(0)
    expect(getOrderStatus, '回到前景時立刻查一次').toHaveBeenCalledTimes(2)
  })

  test('回到前景時，已經有請求在進行就不要再送', async () => {
    const { getOrderStatus } = setup()
    setVisibility('hidden')
    setVisibility('visible')
    await advance(0)
    expect(getOrderStatus, '第一個請求還在進行中，回到前景時不要再送一個').toHaveBeenCalledTimes(1)
  })

  test('狀態變成 ready 就停止', async () => {
    const { r, pending, getOrderStatus } = setup()
    pending[0].resolve('ready')
    await advance(60_000)
    expect(r.status.value).toBe('ready')
    expect(getOrderStatus, 'ready 之後不要再查').toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount(), 'ready 之後不能留下計時器').toBe(0)
    setVisibility('hidden')
    setVisibility('visible')
    await advance(0)
    expect(getOrderStatus, 'ready 之後切換分頁也不能再查：要移除 visibilitychange 的監聽').toHaveBeenCalledTimes(1)
  })

  test('scope 停止：清掉計時器、移除監聽、abort 進行中的請求', async () => {
    const { scope, pending, getOrderStatus } = setup()
    pending[0].resolve('brewing')
    await advance(5000)
    expect(getOrderStatus).toHaveBeenCalledTimes(2)
    scope.stop()
    expect(getOrderStatus.mock.calls[1][1]?.signal?.aborted, '要把 signal 傳給 api，scope 停止時 abort 進行中的請求').toBe(true)
    pending[1].resolve('brewing')
    await advance(60_000)
    expect(vi.getTimerCount(), 'scope 停止後不能留下計時器：用 onScopeDispose 清理').toBe(0)
    setVisibility('hidden')
    setVisibility('visible')
    await advance(0)
    expect(getOrderStatus, 'scope 停止後不能再查').toHaveBeenCalledTimes(2)
  })
})
