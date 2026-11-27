// 練習 1：目前門市 provideCurrentStore／useCurrentStore
// 問題：App 選了門市，第 3、4 層的 PriceTag、OrderHeader 都要知道是哪一家，中間每層都在接 props、往下傳。
//       起始程式改用 provide／inject，但用字串當 key、提供可寫的 ref、找不到提供者時默默回傳 undefined。
// 要求：
//   1. 用 InjectionKey（帶型別的 Symbol）當 key，不要用字串
//   2. provideCurrentStore(initialId) 在提供者的 setup 裡呼叫：用 STORES 找出門市，provide 給所有後代，
//      並回傳同一個 { store, switchStore }（提供者自己 inject 不到自己 provide 的值）
//   3. store 是唯讀的 ref：後代讀得到最新的門市，但不能直接改它（isReadonly(store) 要是 true）
//   4. switchStore(id) 是唯一的修改方式：換成另一家門市，所有後代自動更新；找不到這個 id 時丟出 Error
//   5. useCurrentStore() 回傳 { store, switchStore }；找不到提供者時丟出
//      Error('useCurrentStore() 必須在 provideCurrentStore() 之下使用')，而且不要讓 Vue 先印出 injection not found 警告
import { inject, provide, readonly, ref, type DeepReadonly, type InjectionKey, type Ref } from 'vue'
import { STORES, type Store } from '../../helpers/fake-api.ts'

export type CurrentStore = {
  store: Readonly<Ref<DeepReadonly<Store>>>
  switchStore: (id: number) => void
}

const CURRENT_STORE: InjectionKey<CurrentStore> = Symbol('CurrentStore')

function findStore(id: number): Store {
  const store = STORES.find(s => s.id === id)
  if (!store) throw new Error(`找不到門市 ${id}`)
  return { ...store }
}

export function provideCurrentStore(initialId: number): CurrentStore {
  const store = { value: findStore(initialId) }   // 普通物件：改了沒人知道
  const context: CurrentStore = {
    store: readonly(store) as unknown as CurrentStore['store'],
    switchStore: id => { store.value = findStore(id) },
  }
  provide(CURRENT_STORE, context)
  return context
}

export function useCurrentStore(): CurrentStore {
  const context = inject(CURRENT_STORE, null)   // 給預設值 null：沒有提供者時不警告，由下一行丟出清楚的錯誤
  if (!context) throw new Error('useCurrentStore() 必須在 provideCurrentStore() 之下使用')
  return context
}
