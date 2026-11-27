import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import { STORES, type Store } from '../../helpers/fake-api.ts'

export type CurrentStore = { store: Store; switchStore: (id: number) => void }

// 沒有合理的預設門市：預設值給 null，由 useCurrentStore() 負責丟錯
const CurrentStoreContext = createContext<CurrentStore | null>(null)

function findStore(id: number): Store {
  const store = STORES.find(s => s.id === id)
  if (!store) throw new Error(`找不到門市 ${id}`)
  return store
}

export function CurrentStoreProvider({ initialId, children }: { initialId: number; children: ReactNode }) {
  const [store, setStore] = useState(() => findStore(initialId))
  // store 沒變就是同一個 value 物件（練習 2 的重點）；setStore 的參考永遠不變，不用列進依賴
  const value = useMemo(() => ({ store, switchStore: (id: number) => setStore(findStore(id)) }), [store])
  return <CurrentStoreContext value={value}>{children}</CurrentStoreContext>
}

export function useCurrentStore(): CurrentStore {
  const current = use(CurrentStoreContext)
  if (!current) throw new Error('useCurrentStore() 必須在 <CurrentStoreProvider> 之下使用')
  return current
}
