import { describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import OrderBoard from './OrderBoard.vue'

function setup() {
  vi.useFakeTimers()
  const session = reactive({ storeId: 1 })
  const load = vi.fn((id: number) => `門市 ${id} 的訂單`)
  const wrapper = mount(OrderBoard, { props: { session, load } })
  return { session, load, wrapper }
}

describe('練習 3：OrderBoard 卸載後 watcher 要停止', () => {
  test('掛載 300ms 後，切換門市會更新看板', async () => {
    const { session, load, wrapper } = setup()
    vi.advanceTimersByTime(300)
    session.storeId = 2
    await nextTick()
    expect(load, '掛載 300ms 之後切換門市要呼叫 load(storeId)：原本的監聽行為要保留').toHaveBeenCalledWith(2)
    expect(wrapper.find('p').text()).toBe('門市 2 的訂單')
  })

  test('300ms 之前不監聽（等進場動畫）', async () => {
    const { session, load } = setup()
    vi.advanceTimersByTime(299)
    session.storeId = 2
    await nextTick()
    expect(load, '300ms 還沒到就開始監聽了：「300ms 後才開始監聽」的行為要保留，不能把 watch 移到 setup 直接建立').not.toHaveBeenCalled()
  })

  test('卸載之後 watcher 真的停止，不只是不呼叫 load', async () => {
    vi.useFakeTimers()
    let reads = 0
    // storeId 是 getter：watcher 每執行一次來源，reads 就加 1
    const session = reactive({ id: 1, get storeId() { reads++; return this.id } })
    const load = vi.fn((id: number) => `門市 ${id} 的訂單`)
    const wrapper = mount(OrderBoard, { props: { session, load } })
    vi.advanceTimersByTime(300)
    wrapper.unmount()
    const before = reads
    session.id = 2
    await nextTick()
    expect(reads, '卸載之後 watcher 還在追蹤、還在執行（只是沒呼叫 load）：要呼叫 watch() 回傳的把手把它停掉，不能只用旗標擋住').toBe(before)
  })

  test('卸載之後切換門市，不再呼叫 load', async () => {
    const { session, load, wrapper } = setup()
    vi.advanceTimersByTime(300)
    session.storeId = 2
    await nextTick()
    const before = load.mock.calls.length
    wrapper.unmount()
    session.storeId = 1
    await nextTick()
    session.storeId = 2
    await nextTick()
    expect(load.mock.calls.length, '卸載之後 watcher 還在執行：在 setTimeout 裡建立的 watcher 不會自動停止，要留著 watch() 回傳的把手，在 onUnmounted 呼叫').toBe(before)
  })

  test('300ms 還沒到就卸載，之後也不開始監聽', async () => {
    const { session, load, wrapper } = setup()
    vi.advanceTimersByTime(100)
    wrapper.unmount()
    vi.advanceTimersByTime(300)
    session.storeId = 2
    await nextTick()
    expect(load, '元件已經卸載，計時器到了還是建立了 watcher：卸載時也要 clearTimeout').not.toHaveBeenCalled()
    expect(vi.getTimerCount(), '卸載後還有計時器沒清掉').toBe(0)
  })
})
