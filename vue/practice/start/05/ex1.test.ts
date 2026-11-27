import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'
import { useMenuSearch } from './ex1.ts'

const names = (list: { name: string }[]) => list.map(p => p.name)
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await nextTick() }

function setup() {
  const api = createFakeMenuApi({ manual: true })
  const keyword = ref('')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const s = useMenuSearch(keyword, api)
  return { api, keyword, warn, ...s }
}

describe('練習 1：useMenuSearch 處理競態與取消', () => {
  test('依序輸入「拿」「拿鐵」，舊回應比較晚回來，結果仍是「拿鐵」', async () => {
    const { api, keyword, results, warn } = setup()
    keyword.value = '拿'
    await nextTick()
    keyword.value = '拿鐵'
    await nextTick()
    const calls = api.callsOf('search')
    expect(calls.map(c => c.args[0]), '每次關鍵字改變都要呼叫 api.search(keyword, { signal })').toEqual(['拿', '拿鐵'])
    calls[1].resolve()
    await settle()
    calls[0].resolve([{ id: 99, name: '過期的結果', price: 0, category: 'coffee' }])
    await settle()
    expect(names(results.value), '舊的「拿」回應蓋掉了新的結果：新搜尋開始時要取消上一個請求').toEqual(['拿鐵'])
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('[Vue warn]')),
      '出現 Vue 警告：onWatcherCleanup 要在 await 之前呼叫').toEqual([])
  })

  test('第一個請求的 signal 被中止', async () => {
    const { api, keyword } = setup()
    keyword.value = '拿'
    await nextTick()
    const first = api.callsOf('search')[0]
    expect(first?.signal, '要把 AbortController 的 signal 傳給 api.search(keyword, { signal })').toBeInstanceOf(AbortSignal)
    keyword.value = '拿鐵'
    await nextTick()
    expect(first.signal!.aborted, '新搜尋開始時，上一個請求的 signal 要被 abort()：在 await 之前用 onWatcherCleanup 登記').toBe(true)
  })

  test('被取消的請求不算錯誤，error 保持 null', async () => {
    const { api, keyword, error } = setup()
    keyword.value = '拿'
    await nextTick()
    keyword.value = '拿鐵'
    await nextTick()
    await settle()
    expect(error.value, '被取消的請求會以 AbortError reject，這是你自己取消的，不要存進 error（可以檢查 controller.signal.aborted）').toBeNull()
    api.callsOf('search')[1].resolve()
    await settle()
    expect(error.value).toBeNull()
  })

  test('真正的錯誤要存進 error，下一次搜尋開始時清掉', async () => {
    const { api, keyword, error, results } = setup()
    keyword.value = '拿鐵'
    await nextTick()
    api.callsOf('search')[0].resolve()
    await settle()
    expect(names(results.value)).toEqual(['拿鐵'])
    keyword.value = '可'
    await nextTick()
    const boom = new Error('伺服器 500')
    api.callsOf('search')[1].reject(boom)
    await settle()
    expect(error.value, '伺服器錯誤要存進 error，不能吞掉').toBe(boom)
    expect(results.value, '搜尋失敗時要清空 results，不能留著上一次「拿鐵」的結果').toEqual([])
    keyword.value = '拿'
    await nextTick()
    expect(error.value, '開始新的搜尋時，error 要先設回 null').toBeNull()
  })

  test('請求進行中清空關鍵字：結果立刻清空，舊請求回來也不會填回，也不再發請求', async () => {
    const { api, keyword, results } = setup()
    keyword.value = '拿鐵'
    await nextTick()
    api.callsOf('search')[0].resolve()
    await settle()
    expect(names(results.value)).toEqual(['拿鐵'])
    keyword.value = '可'
    await nextTick()
    keyword.value = '   '
    await nextTick()
    expect(results.value, '關鍵字清空時 results 要立刻清空').toEqual([])
    expect(api.callsOf('search').length, '空字串（或只有空白）不要發請求').toBe(2)
    const pending = api.callsOf('search')[1]
    expect(pending.signal?.aborted, '清空關鍵字時也要取消進行中的請求').toBe(true)
    pending.resolve()
    await settle()
    expect(results.value, '舊的「可」請求回來又把結果填回去了').toEqual([])
  })

  test('所屬的 effect scope 停止（例如元件卸載）時，取消進行中的請求', async () => {
    const api = createFakeMenuApi({ manual: true })
    const keyword = ref('')
    const scope = effectScope()
    scope.run(() => useMenuSearch(keyword, api))
    keyword.value = '拿鐵'
    await nextTick()
    scope.stop()
    expect(api.callsOf('search')[0]?.signal?.aborted,
      'scope 停止後請求還在進行：用 onWatcherCleanup（或 onCleanup）登記 abort，watcher 停止時 Vue 也會呼叫它；自己在下一次執行時 abort 做不到這點').toBe(true)
  })
})
