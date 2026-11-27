// 練習 3（之二）：目前門市 provideCurrentStore／useCurrentStore 的型別
// 問題：key 是字串 'currentStore'，inject 不知道拿到的是什麼：
//       useCurrentStore() 的回傳型別不是 Ref<Store>，SearchPage 讀 store.value.name 就報錯；
//       provide 時塞錯型別（例如數字）也不會被擋下。
// 要求：
//   1. CURRENT_STORE_KEY 改成帶型別的 InjectionKey（第 13 課），提供的值是 Ref<Store>
//   2. useCurrentStore() 回傳 Ref<Store>，不能用型別斷言（as）或 any
//   3. provide(CURRENT_STORE_KEY, 123) 這種錯誤要報錯
//   4. 行為不變：找不到提供者時丟出 Error
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { STORES, type Store } from '../../helpers/fake-api.ts'

export const CURRENT_STORE_KEY = Symbol('currentStore')

function findStore(id: number): Store {
  const store = STORES.find(s => s.id === id)
  if (!store) throw new Error(`找不到門市 ${id}`)
  return { ...store }
}

export function provideCurrentStore(initialId: number) {
  const store = ref(findStore(initialId))
  provide(CURRENT_STORE_KEY, store)
  return store
}

export function useCurrentStore() {
  const store = inject(CURRENT_STORE_KEY, null) as Ref<Store> | null
  if (!store) throw new Error('useCurrentStore() 必須在 provideCurrentStore() 之下使用')
  return store
}
