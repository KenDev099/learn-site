import { describe, expect, test, vi } from 'vitest'
import { effectScope, isProxy, nextTick, reactive } from 'vue'
import { useDraftAutosave, type OrderForm } from './ex2.ts'

function setup(options?: { delay?: number }) {
  vi.useFakeTimers()
  const form = reactive<OrderForm>({ note: '', options: { sugar: '正常', ice: '正常' } })
  const save = vi.fn<(draft: OrderForm) => void>()
  const scope = effectScope()
  scope.run(() => useDraftAutosave(form, save, options))
  return { form, save, scope }
}

describe('練習 2：useDraftAutosave 防抖存草稿', () => {
  test('改巢狀的 options.sugar：799ms 不存，800ms 存一次', async () => {
    const { form, save } = setup()
    form.options.sugar = '半糖'
    await nextTick()
    vi.advanceTimersByTime(799)
    expect(save, '還沒到 800ms 就存了').not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save, '改 options.sugar 之後沒有存：要監聽整個 form（深層），不能只監聽 note；用 getter () => form 時要加 deep').toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].options.sugar).toBe('半糖')
  })

  test('delay 參數要生效：{ delay: 300 } 時 300ms 就存', async () => {
    const { form, save } = setup({ delay: 300 })
    form.note = '去冰'
    await nextTick()
    vi.advanceTimersByTime(299)
    expect(save, '還沒到 delay 就存了').not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save, '傳入 { delay: 300 } 卻沒有在 300ms 存檔：setTimeout 要用 delay 參數，不能寫死 800').toHaveBeenCalledTimes(1)
  })

  test('連續修改只存最後一次，內容是最新的', async () => {
    const { form, save } = setup()
    form.note = '少'
    await nextTick()
    vi.advanceTimersByTime(400)
    form.note = '少冰'
    await nextTick()
    vi.advanceTimersByTime(400)
    form.options.ice = '少冰'
    await nextTick()
    vi.advanceTimersByTime(800)
    expect(save, '存了好幾次：每次改動都要取消上一個計時器（onWatcherCleanup(() => clearTimeout(timer))）').toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual({ note: '少冰', options: { sugar: '正常', ice: '少冰' } })
  })

  test('draft 是普通物件複本：之後改 form 不影響已存的草稿', async () => {
    const { form, save } = setup()
    form.note = '要吸管'
    await nextTick()
    vi.advanceTimersByTime(800)
    const draft = save.mock.calls[0]?.[0]
    expect(draft, '沒有存檔').toBeDefined()
    expect(isProxy(draft), 'draft 是 reactive proxy：要存一份普通物件複本，例如 structuredClone(toRaw(form))').toBe(false)
    form.note = '不要吸管'
    form.options.sugar = '無糖'
    expect(draft, '已存的草稿被之後的修改改到了：要複製一份，而且巢狀的 options 也要複製').toEqual({ note: '要吸管', options: { sugar: '正常', ice: '正常' } })
  })

  test('scope 停止後不再存檔，也不留下計時器', async () => {
    const { form, save, scope } = setup()
    form.note = '外帶'
    await nextTick()
    scope.stop()
    vi.advanceTimersByTime(800)
    expect(save, '停止後還在存檔：用 onWatcherCleanup 登記 clearTimeout，watcher 停止時也會執行').not.toHaveBeenCalled()
    form.note = '內用'
    await nextTick()
    vi.advanceTimersByTime(800)
    expect(save).not.toHaveBeenCalled()
    expect(vi.getTimerCount(), '停止後還有計時器沒清掉').toBe(0)
  })

  test('form 沒有改變就不存', async () => {
    const { save } = setup()
    vi.advanceTimersByTime(2000)
    expect(save, '表單沒有任何改變卻存檔了：不要加 immediate，只在 form 改變後才開始計時').not.toHaveBeenCalled()
  })
})
