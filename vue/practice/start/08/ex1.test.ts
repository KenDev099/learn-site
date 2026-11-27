import { describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { serverRender } from '../../helpers/ssr.ts'
import PickupCountdown from './PickupCountdown.vue'

describe('練習 1：取餐倒數要在卸載時清除計時器', () => {
  test('每 60 秒減 1，畫面每一次都更新', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PickupCountdown, { props: { minutes: 15 } })
    expect(wrapper.text()).toBe('取餐倒數 15 分鐘')
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(wrapper.text(), '過了 60 秒要變成 14：計時器要在 onMounted 裡用 setInterval 開始').toBe('取餐倒數 14 分鐘')
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(wrapper.text(), '第二個 60 秒沒有再減 1：setTimeout 只會執行一次，要用 setInterval').toBe('取餐倒數 13 分鐘')
  })

  test('卸載之後不留下任何計時器', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PickupCountdown, { props: { minutes: 15 } })
    expect(vi.getTimerCount(), '掛載後要有一個計時器在跑').toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount(),
      '卸載後計時器還在：要在 onUnmounted 呼叫 clearInterval。在 onBeforeMount 清除沒有用，那時計時器還沒開始').toBe(0)
    expect(() => vi.advanceTimersByTime(180_000)).not.toThrow()
  })

  test('元件放進頁面（onMounted）之後才開始計時', () => {
    vi.useFakeTimers()
    const fakeSetInterval = globalThis.setInterval
    const inPageWhenStarted: boolean[] = []
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
      inPageWhenStarted.push(document.body.textContent?.includes('取餐倒數') ?? false)
      return fakeSetInterval(fn, ms)
    }) as typeof setInterval)
    mount(PickupCountdown, { props: { minutes: 15 }, attachTo: document.body })
    expect(inPageWhenStarted.every(Boolean),
      'setInterval 在元件放進頁面之前就呼叫了：用 typeof window 判斷之類的寫法還是在 setup 開始計時，要移到 onMounted 裡').toBe(true)
  })

  test('只在掛載後開始計時（伺服器渲染時不能開始）', async () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const html = await serverRender(PickupCountdown, { minutes: 15 })
    expect(html).toContain('取餐倒數 15 分鐘')
    expect(setIntervalSpy.mock.calls.length,
      '伺服器渲染後留下了計時器：setup 在伺服器上也會執行，onMounted 不會。把 setInterval 移到 onMounted 裡').toBe(0)
  })
})
