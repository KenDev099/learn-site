/*
練習 1：目前門市的 context（CurrentStoreProvider 與 useCurrentStore）
情境：後台可以切換門市（總店、分店）。門市在最外層選，價格標籤、訂單標題在好幾層底下才用到，
      不想讓中間每一層都轉手一個 store prop。
要求：
  1. 用 createContext 建立 context，預設值給 null（沒有合理的預設門市）
  2. <CurrentStoreProvider initialId={1}>：用 state 記住目前門市（從 STORES 找），
     把 { store, switchStore } 提供給底下所有元件
  3. useCurrentStore() 回傳最近一層 CurrentStoreProvider 提供的 { store, switchStore }；
     上面沒有 CurrentStoreProvider 時丟出 Error('useCurrentStore() 必須在 <CurrentStoreProvider> 之下使用')
     回傳型別是 CurrentStore，不含 null：呼叫的人不用自己檢查
  4. switchStore(id) 換成那一家門市，所有讀它的元件都要更新；
     STORES 裡沒有這個 id 時丟出 Error(`找不到門市 ${id}`)，目前門市不變
不能做的事：
  - 不能把目前門市存在模組層級的變數（畫面上有兩個 CurrentStoreProvider 時要各自獨立）
  - 不能直接改 store 物件的屬性（要換成另一個物件，React 才知道要重新 render）
*/
import { type ReactNode } from 'react'
import { STORES, type Store } from '../../helpers/fake-api.ts'

export type CurrentStore = { store: Store; switchStore: (id: number) => void }

export function CurrentStoreProvider({ children }: { initialId: number; children: ReactNode }) {
  return <>{children}</>
}

export function useCurrentStore(): CurrentStore {
  return { store: STORES[0], switchStore() {} }
}
