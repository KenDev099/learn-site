import { describe, expect, test } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { typecheck } from '../../helpers/typecheck.ts'
import { useAsyncData } from './useAsyncData.ts'

type Item = { name: string }

function setup(initial = '拿鐵') {
  const key = ref(initial)
  const calls: { key: string; signal: AbortSignal; d: Deferred<Item> }[] = []
  const fetcher = (k: string, signal: AbortSignal) => {
    const d = deferred<Item>()
    calls.push({ key: k, signal, d })
    return d.promise   // 故意不理會 signal：過期的回應要由 useAsyncData 自己丟掉
  }
  const scope = effectScope()
  const r = scope.run(() => useAsyncData(key, fetcher))!
  const state = () => (r as unknown as { state?: { value: unknown } }).state?.value as Record<string, unknown> | undefined
  return { key, calls, scope, r, state }
}
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await nextTick() }

describe('練習 1：useAsyncData', () => {
  test('一建立就抓：先是 loading，成功後是 success', async () => {
    const { calls, state } = setup()
    expect(state(), '要回傳 { state, refresh }，state 是 ref，值用 status 欄位區分狀態，不要用 isLoading／error／data 三個分開的 ref').toBeTruthy()
    expect(calls.length, '一建立就要呼叫 fetcher').toBe(1)
    expect(calls[0].key).toBe('拿鐵')
    expect(state()?.status).toBe('loading')
    calls[0].d.resolve({ name: '拿鐵' })
    await tick()
    expect(state(), '成功後 state 要是 { status: \'success\', data }').toEqual({ status: 'success', data: { name: '拿鐵' } })
  })

  test('快速切換 key：舊的回應比較晚回來，也不能蓋掉新的結果', async () => {
    const { key, calls, state } = setup('拿')
    key.value = '拿鐵'
    await tick()
    expect(calls.map(c => c.key), 'key 改變要用新的 key 重新呼叫 fetcher').toEqual(['拿', '拿鐵'])
    expect(calls[0].signal.aborted, '開始新的一次時，要 abort 上一次的 signal').toBe(true)
    calls[1].d.resolve({ name: '拿鐵' })
    await tick()
    calls[0].d.resolve({ name: '（「拿」的舊結果）' })
    await tick()
    expect(state(), '過期的回應蓋掉了新的結果：await 回來之後先檢查這次是不是已經被取代（signal.aborted），是的話直接丟掉').toEqual({ status: 'success', data: { name: '拿鐵' } })
  })

  test('過期的請求失敗，也不能把狀態改成 error', async () => {
    const { key, calls, state } = setup('拿')
    key.value = '拿鐵'
    await tick()
    calls[1].d.resolve({ name: '拿鐵' })
    calls[0].d.reject(new Error('舊的請求失敗'))
    await tick()
    expect(state()?.status, 'catch 裡也要先檢查是不是過期的請求').toBe('success')
  })

  test('換 key 載入時，loading 帶著上一次的資料（previous），畫面不會閃成空白', async () => {
    const { key, calls, state } = setup('拿鐵')
    calls[0].d.resolve({ name: '拿鐵' })
    await tick()
    key.value = '可頌'
    await tick()
    expect(state(), '新的 loading 狀態要帶著上一次成功的資料：{ status: \'loading\', previous: 上一次的 data }').toEqual({ status: 'loading', previous: { name: '拿鐵' } })
    key.value = '起司蛋糕'
    await tick()
    expect(state(), '連續切換時，前一個 loading 帶著的 previous 要繼續帶下去').toEqual({ status: 'loading', previous: { name: '拿鐵' } })
  })

  test('失敗時狀態是 error，帶著 Error', async () => {
    const { calls, state } = setup()
    calls[0].d.reject(new Error('伺服器忙碌'))
    await tick()
    expect(state()?.status).toBe('error')
    expect((state()?.error as Error | undefined)?.message, 'error 要存 fetcher 丟出的 Error').toBe('伺服器忙碌')
    expect(Object.keys(state() ?? {}).sort(), 'error 狀態只有 status 和 error 兩個欄位').toEqual(['error', 'status'])
  })

  test('refresh() 用現在的 key 再抓一次', async () => {
    const { calls, state, r } = setup()
    calls[0].d.resolve({ name: '拿鐵' })
    await tick()
    ;(r as unknown as { refresh: () => void }).refresh()
    await tick()
    expect(calls.length, 'refresh 要再呼叫一次 fetcher').toBe(2)
    expect(calls[1].key).toBe('拿鐵')
    expect(state()).toEqual({ status: 'loading', previous: { name: '拿鐵' } })
    calls[1].d.resolve({ name: '拿鐵（新）' })
    await tick()
    expect(state()).toEqual({ status: 'success', data: { name: '拿鐵（新）' } })
  })

  test('key 是空字串時是 idle，不呼叫 fetcher；也可以傳 getter', async () => {
    const keyword = ref('')
    const calls: string[] = []
    const scope = effectScope()
    const r = scope.run(() => useAsyncData(() => keyword.value.trim(), async k => { calls.push(k); return k }))!
    const state = () => (r as unknown as { state?: { value: unknown } }).state?.value
    expect(state(), 'key 是空字串時 state 是 { status: \'idle\' }').toEqual({ status: 'idle' })
    expect(calls, 'key 是空字串時不要呼叫 fetcher').toEqual([])
    keyword.value = ' 美式 '
    await tick()
    expect(calls, 'key 是 getter 時，值改變也要重新抓（用 toValue 讀）').toEqual(['美式'])
    scope.stop()
  })

  test('key 變成空字串：回到 idle，abort 進行中的請求，晚到的回應也不能改 state', async () => {
    const { key, calls, state } = setup('拿')
    key.value = ''
    await tick()
    expect(state(), 'key 變成空字串時 state 要回到 { status: \'idle\' }').toEqual({ status: 'idle' })
    expect(calls[0].signal.aborted, 'key 變成空字串時，也要先 abort 進行中的請求').toBe(true)
    calls[0].d.resolve({ name: '（「拿」的舊結果）' })
    await tick()
    expect(state(), '已經回到 idle，舊請求的回應不能把 state 改成 success').toEqual({ status: 'idle' })
  })

  test('型別：state 是可辨識聯合，檢查 status 之後才能讀 data', () => {
    const out = typecheck(import.meta.dirname, {
      '__ex1.usage.ts': `
import { useAsyncData } from './useAsyncData.ts'
const { state } = useAsyncData('拿鐵', async () => ({ price: 110 }))
const s = state.value
if (s.status === 'success') { const price: number = s.data.price; void price }
if (s.status === 'loading') { const p: number | undefined = s.previous?.price; void p }
if (s.status === 'error') { const m: string = s.error.message; void m }
// @ts-expect-error 還沒檢查 status，不能讀 data
s.data
`,
    })
    expect(out, 'AsyncState<T> 要寫成四個物件型別的聯合，每個都有字面值型別的 status；data 只出現在 success 裡').toBe('')
  }, 30_000)
})
