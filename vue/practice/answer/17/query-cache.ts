// 練習 2：createQueryCache
// 問題：菜單同時出現在側欄和主畫面，兩個元件各自 useQuery('menu', …)，每次掛載都重新打一次 API；
//       收藏或改價之後，畫面上的菜單也不會更新。
// 要求：createQueryCache({ now }) 回傳 { useQuery, invalidate }，快取以 key 為單位，存在這個 cache 物件裡（不要放在模組最外層）
//   1. useQuery(key, fetcher, { staleTime = 0 }) 回傳 { data, error, isFetching } 三個 ref；必須在 effect scope（元件 setup）裡呼叫
//   2. 合併請求：同一個 key 已經有請求在進行中，就不要再呼叫 fetcher，共用那一次的結果
//   3. 新鮮時間：資料抓回來的時間（用 now() 記）到現在小於 staleTime，就直接用快取，不呼叫 fetcher
//   4. 過期（stale-while-revalidate）：data 先給快取裡的舊資料，同時在背景重抓（isFetching 為 true），抓回來再更新 data
//   5. invalidate(key)：把快取標成過期；目前有 scope 在使用這個 key 時立刻重抓。沒人使用時不重抓，下一次 useQuery 才抓
//   6. 使用者的 scope 停止時，要讓 cache 知道少了一個使用者（onScopeDispose）
//   fetcher 失敗時把錯誤存進 error（Error），data 保留原本的值；成功時 error 設回 null
import { onScopeDispose, shallowRef, type ShallowRef } from 'vue'

type Entry = {
  data: ShallowRef<unknown>
  error: ShallowRef<Error | null>
  isFetching: ShallowRef<boolean>
  updatedAt: number
  fetcher: () => Promise<unknown>
  promise?: Promise<void>
  users: number
}

export function createQueryCache({ now = Date.now }: { now?: () => number } = {}) {
  const entries = new Map<string, Entry>()

  function fetchEntry(entry: Entry) {
    if (entry.promise) return entry.promise   // 合併：進行中的請求共用
    entry.isFetching.value = true
    entry.promise = entry.fetcher().then(
      d => { entry.data.value = d; entry.error.value = null; entry.updatedAt = now() },
      e => { entry.error.value = e instanceof Error ? e : new Error(String(e)) },
    ).finally(() => {
      entry.promise = undefined
      entry.isFetching.value = false
    })
    return entry.promise
  }

  function useQuery<T>(key: string, fetcher: () => Promise<T>, { staleTime = 0 }: { staleTime?: number } = {}) {
    let entry = entries.get(key)
    if (!entry) {
      entry = { data: shallowRef(), error: shallowRef(null), isFetching: shallowRef(false), updatedAt: -Infinity, fetcher, users: 0 }
      entries.set(key, entry)
    }
    const e = entry
    e.fetcher = fetcher
    e.users++
    onScopeDispose(() => { e.users-- })
    if (now() - e.updatedAt >= staleTime) fetchEntry(e)   // 過期：data 先是舊資料，背景重抓
    return {
      data: e.data as ShallowRef<T | undefined>,
      error: e.error,
      isFetching: e.isFetching,
    }
  }

  function invalidate(key: string) {
    const entry = entries.get(key)
    if (!entry) return
    entry.updatedAt = -Infinity
    if (entry.users > 0) fetchEntry(entry)
  }

  return { useQuery, invalidate }
}
