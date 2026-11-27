import { describe, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { createQueryCache } from './query-cache.ts'

type Menu = string[]

function setup() {
  let t = 0
  const cache = createQueryCache({ now: () => t })
  const pending: Deferred<Menu>[] = []
  const fetcher = vi.fn(() => {
    const d = deferred<Menu>()
    pending.push(d)
    return d.promise
  })
  const use = (key = 'menu', staleTime = 60_000) => {
    const scope = effectScope()
    const q = scope.run(() => cache.useQuery(key, fetcher, { staleTime }))!
    return { scope, q }
  }
  return { cache, fetcher, pending, use, setTime: (ms: number) => { t = ms } }
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('練習 2：以 key 為單位的查詢快取', () => {
  test('兩個元件同時使用同一個 key：只呼叫 fetcher 一次，兩邊拿到同一份資料', async () => {
    const { fetcher, pending, use } = setup()
    const a = use()
    const b = use()
    expect(fetcher, '同一個 key 已經有請求在進行中，要共用那個請求（合併請求），不要再呼叫 fetcher').toHaveBeenCalledTimes(1)
    expect(a.q.isFetching.value, '請求進行中 isFetching 要是 true').toBe(true)
    pending[0].resolve(['美式咖啡', '拿鐵'])
    await flush()
    expect(a.q.data.value).toEqual(['美式咖啡', '拿鐵'])
    expect(b.q.data.value, '兩個使用者要看到同一份快取資料').toEqual(['美式咖啡', '拿鐵'])
    expect(a.q.isFetching.value).toBe(false)
  })

  test('不同的 key 各自快取', () => {
    const { fetcher, use } = setup()
    use('menu')
    use('stores')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test('新鮮時間內再次使用：直接拿到快取，不重抓', async () => {
    const { fetcher, pending, use, setTime } = setup()
    const a = use()
    pending[0].resolve(['美式咖啡'])
    await flush()
    a.scope.stop()
    setTime(30_000)
    const b = use()
    expect(fetcher, 'staleTime 是 60 秒，30 秒後再使用不應該重抓：記下資料抓回來的時間 now()，比較 now() - 那個時間 < staleTime').toHaveBeenCalledTimes(1)
    expect(b.q.data.value, '新鮮的快取要立刻給資料').toEqual(['美式咖啡'])
  })

  test('過期後：先給舊資料，同時在背景重抓，抓回來再更新', async () => {
    const { fetcher, pending, use, setTime } = setup()
    use()
    pending[0].resolve(['美式咖啡'])
    await flush()
    setTime(61_000)
    const b = use()
    expect(fetcher, '超過 staleTime 要重抓').toHaveBeenCalledTimes(2)
    expect(b.q.data.value, 'stale-while-revalidate：重抓期間 data 先給快取裡的舊資料，不要變成 undefined').toEqual(['美式咖啡'])
    expect(b.q.isFetching.value, '背景重抓時 isFetching 是 true').toBe(true)
    pending[1].resolve(['美式咖啡', '可頌'])
    await flush()
    expect(b.q.data.value).toEqual(['美式咖啡', '可頌'])
    setTime(100_000)
    use()
    expect(fetcher, '新鮮時間要從最後一次抓回來的時間起算（61 秒那次），100 秒時還是新鮮的').toHaveBeenCalledTimes(2)
  })

  test('invalidate：使用中的 query 立刻重抓並更新資料', async () => {
    const { cache, fetcher, pending, use } = setup()
    const a = use()
    pending[0].resolve(['拿鐵 110'])
    await flush()
    cache.invalidate('menu')
    expect(fetcher, 'invalidate 之後，正在使用這個 key 的 query 要重新呼叫 fetcher（只刪掉快取，畫面不會更新）').toHaveBeenCalledTimes(2)
    pending[1].resolve(['拿鐵 120'])
    await flush()
    expect(a.q.data.value, '重抓回來的資料要更新到原本的 data ref 上').toEqual(['拿鐵 120'])
  })

  test('invalidate：沒人使用時不重抓，下一次使用才抓（即使還在新鮮時間內）', async () => {
    const { cache, fetcher, pending, use } = setup()
    const a = use()
    pending[0].resolve(['拿鐵 110'])
    await flush()
    a.scope.stop()
    cache.invalidate('menu')
    expect(fetcher, '沒有 scope 在使用時不要重抓：用 onScopeDispose 讓 cache 知道使用者離開了').toHaveBeenCalledTimes(1)
    use()
    expect(fetcher, '被 invalidate 的快取已經過期，下一次 useQuery 要重抓').toHaveBeenCalledTimes(2)
  })

  test('fetcher 失敗：error 存 Error，data 保留原本的值', async () => {
    const { cache, pending, use } = setup()
    const a = use()
    pending[0].resolve(['美式咖啡'])
    await flush()
    cache.invalidate('menu')
    pending[1].reject(new Error('伺服器忙碌'))
    await flush()
    expect(a.q.error.value?.message).toBe('伺服器忙碌')
    expect(a.q.data.value, '失敗時不要清掉已經有的資料').toEqual(['美式咖啡'])
    expect(a.q.isFetching.value).toBe(false)
    cache.invalidate('menu')
    pending[2].resolve(['美式咖啡', '可頌'])
    await flush()
    expect(a.q.data.value).toEqual(['美式咖啡', '可頌'])
    expect(a.q.error.value, '重抓成功後 error 要設回 null，不然畫面會一直顯示舊的錯誤').toBe(null)
  })

  test('兩個 cache 互不影響（快取不能放在模組最外層）', () => {
    const one = setup(), two = setup()
    one.use()
    two.use()
    expect(two.fetcher, '每個 createQueryCache() 要有自己的 Map').toHaveBeenCalledTimes(1)
  })
})
