import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { typecheck } from '../../helpers/typecheck.ts'
import { useStampCard } from './useStampCard.ts'

// 假的集點 API：每次呼叫都記下來，由測試決定什麼時候、以什麼點數完成
function fakeApi() {
  const calls: { id: number; d: Deferred<number> }[] = []
  const api = {
    getPoints: vi.fn((id: number) => {
      const d = deferred<number>()
      calls.push({ id, d })
      return d.promise
    }),
  }
  return { api, calls }
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await nextTick() }

function start(id: Parameters<typeof useStampCard>[0]) {
  const { api, calls } = fakeApi()
  const scope = effectScope()
  const card = scope.run(() => useStampCard(id, api))!
  return { api, calls, scope, ...card }
}

describe('練習 2：useStampCard 接受數字、ref、getter', () => {
  test('傳數字：載入一次，points 從 null 變成點數，loading 跟著變，沒有 Vue 警告', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { api, calls, points, loading } = start(1)
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('[Vue warn]')),
      '出現 Vue 警告：數字不是有效的 watch 來源，watch(customerId, …) 在傳數字時無效。改成 watch(() => toValue(customerId), …)').toEqual([])
    expect(points.value, 'points 一開始是 null').toBeNull()
    expect(api.getPoints, '一建立就要呼叫 api.getPoints(customerId)').toHaveBeenCalledTimes(1)
    expect(calls[0].id).toBe(1)
    expect(loading.value, '請求進行中 loading 要是 true').toBe(true)
    calls[0].d.resolve(7)
    await settle()
    expect(points.value).toBe(7)
    expect(loading.value, '請求完成後 loading 要回到 false').toBe(false)
    await settle()
    expect(api.getPoints, '數字不會變，只要載入一次').toHaveBeenCalledTimes(1)
  })

  test('傳 ref：值改變就用新的 id 重新載入', async () => {
    const id = ref(1)
    const { calls, points } = start(id)
    calls[0].d.resolve(7)
    await settle()
    id.value = 2
    await settle()
    expect(calls.map(c => c.id), 'customerId 改變後要重新載入：在 watch 的 getter 裡呼叫 toValue(customerId) 才會被追蹤，在函式開頭讀一次只拿到當下的值').toEqual([1, 2])
    calls[1].d.resolve(30)
    await settle()
    expect(points.value).toBe(30)
  })

  test('傳 getter：() => props.customerId 這種寫法也要追蹤', async () => {
    const props = ref({ customerId: 3 })
    const { calls } = start(() => props.value.customerId)
    expect(calls.map(c => c.id), 'getter 要被呼叫才拿得到 id：用 toValue，不要用 unref（unref 不會呼叫函式）').toEqual([3])
    props.value = { customerId: 4 }
    await settle()
    expect(calls.map(c => c.id), 'getter 的回傳值改變後要重新載入').toEqual([3, 4])
  })

  test('上一位顧客的回應比較晚回來，不能蓋掉現在顧客的點數', async () => {
    const id = ref(1)
    const { calls, points, loading } = start(id)
    id.value = 2
    await settle()
    calls[1].d.resolve(30)
    await settle()
    calls[0].d.resolve(7)
    await settle()
    expect(points.value, '舊的回應蓋掉了新的點數：只採用最新一次請求的結果（第 5 課的競態）').toBe(30)
    expect(loading.value).toBe(false)
  })

  test('上一位顧客的回應先回來、新的還在等：不採用舊點數，loading 維持 true', async () => {
    const id = ref(1)
    const { calls, points, loading } = start(id)
    id.value = 2
    await settle()
    calls[0].d.resolve(7)
    await settle()
    expect(points.value, '舊請求的結果不能寫進 points：只採用最新一次請求的結果').toBeNull()
    expect(loading.value, '最新的請求還沒回來，loading 要維持 true：舊請求完成時不能把 loading 設回 false').toBe(true)
    calls[1].d.resolve(30)
    await settle()
    expect(points.value).toBe(30)
    expect(loading.value).toBe(false)
  })

  test('reload() 用現在的 customerId 再載入一次，結果寫進 points', async () => {
    const id = ref(1)
    const { calls, points, reload } = start(id)
    id.value = 5
    await settle()
    calls[1].d.resolve(20)
    await settle()
    reload()
    expect(calls.map(c => c.id), 'reload() 要用現在的 customerId（5）').toEqual([1, 5, 5])
    calls[2].d.resolve(21)
    await settle()
    expect(points.value, 'reload() 的結果要寫進 points（reload 就是再跑一次同一個載入函式）').toBe(21)
  })

  test('型別：數字、ref、getter 三種都能傳', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex2.usage.ts': [
        "import { ref } from 'vue'",
        "import { useStampCard, type StampApi } from './useStampCard.ts'",
        'declare const api: StampApi',
        'useStampCard(1, api)',
        'useStampCard(ref(1), api)',
        'useStampCard(() => 1, api)',
        '// @ts-expect-error 參數型別不能是 any：字串要報錯',
        "useStampCard('1', api)",
        '',
      ].join('\n'),
    })
    expect(errors, `參數型別要改成 MaybeRefOrGetter<number>（不能用 any，傳字串要報錯）：\n${errors}`).toBe('')
  }, 30_000)
})
