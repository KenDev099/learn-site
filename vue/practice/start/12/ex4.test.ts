import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PickupBoard from './PickupBoard.vue'

function setup() {
  vi.useFakeTimers()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  let n = 3
  const load = vi.fn(async () => n++)
  const wrapper = mount(PickupBoard, { props: { load } })
  return { warn, load, wrapper }
}
const vueWarnings = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('[Vue warn]'))

describe('練習 4：PickupBoard 在 setup 裡同步呼叫 composable', () => {
  test('掛載後載入一次，之後每 10 秒更新', async () => {
    const { load, wrapper } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(load, '掛載後要載入一次').toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('等待中：3 張訂單')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load, '10 秒後要再載入一次').toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('等待中：4 張訂單')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load).toHaveBeenCalledTimes(3)
  })

  test('卸載後不再呼叫 load，也沒有留下計時器', async () => {
    const { warn, load, wrapper } = setup()
    await vi.advanceTimersByTimeAsync(10_000)
    const before = load.mock.calls.length
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load.mock.calls.length, '卸載後還在呼叫 load：useInterval 在 await 之後呼叫，清理掛不上。要在 setup 裡同步呼叫').toBe(before)
    expect(vi.getTimerCount(), '卸載後還留著計時器').toBe(0)
    expect(vueWarnings(warn), '出現 Vue 警告：composable 要在沒有 await 的地方（setup 頂層）呼叫').toEqual([])
  })
})
