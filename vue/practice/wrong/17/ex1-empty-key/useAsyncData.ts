// 練習 1：useAsyncData
// 問題：商品詳情頁用三個 ref（isLoading、error、data）表示載入狀態，可以組出「又在載入又有錯誤」這種不存在的狀態；
//       客人快速切換商品時，比較慢的舊回應最後才回來，把新商品的資料蓋掉；換商品時畫面先被清空再出現，會閃一下。
// 要求：
//   1. 回傳 { state, refresh }。state 是一個 ref，值是 AsyncState<T>（可辨識聯合，用 status 區分四種狀態）：
//        { status: 'idle' }                     key 是空字串，什麼都不抓
//        { status: 'loading'; previous?: T }    抓取中；previous 是上一次成功（或上一個 loading 帶著）的資料，畫面可以先顯示它
//        { status: 'success'; data: T }
//        { status: 'error'; error: Error }
//   2. key 可以是字串、ref 或 getter（MaybeRefOrGetter<string>）；一建立就抓，key 改變就重新抓，呼叫 fetcher(key, signal)
//   3. 開始新的一次時，abort 上一次的 signal；過期的回應（不管成功或失敗）都不能改 state
//   4. refresh() 用現在的 key 再抓一次（一樣要先進入 loading、帶著 previous）
import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading'; previous?: T }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

export function useAsyncData<T>(key: MaybeRefOrGetter<string>, fetcher: (key: string, signal: AbortSignal) => Promise<T>) {
  const state = shallowRef<AsyncState<T>>({ status: 'idle' })
  let controller: AbortController | undefined

  async function load() {
    const k = toValue(key)
    if (!k) return
    controller?.abort()
    const c = (controller = new AbortController())
    const s = state.value
    const previous = s.status === 'success' ? s.data : s.status === 'loading' ? s.previous : undefined
    state.value = { status: 'loading', previous }
    try {
      const data = await fetcher(k, c.signal)
      if (!c.signal.aborted) state.value = { status: 'success', data }
    } catch (e) {
      if (!c.signal.aborted) state.value = { status: 'error', error: e instanceof Error ? e : new Error(String(e)) }
    }
  }
  watch(() => toValue(key), load, { immediate: true })
  onScopeDispose(() => controller?.abort())

  return { state: state as Readonly<Ref<AsyncState<T>>>, refresh: load }
}
