// 練習 2 用的 InjectionKey 與型別：Tabs provide、Tab inject。需要的話可以修改
import type { InjectionKey, Ref } from 'vue'

export type TabInfo = { id: string; title: string }

export type TabsContext = {
  /** 目前選取的分頁 id（唯讀） */
  selectedId: Readonly<Ref<string | null>>
  /** Tab 在 setup 時呼叫 */
  register: (tab: TabInfo) => void
  /** Tab 卸載時呼叫 */
  unregister: (id: string) => void
}

export const TABS_KEY: InjectionKey<TabsContext> = Symbol('Tabs')
