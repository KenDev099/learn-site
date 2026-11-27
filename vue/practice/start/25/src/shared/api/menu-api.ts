// 練習 1：菜單 API（shared/api，要寫 createHttpMenuApi）
// 整個專案只有 shared/api 可以呼叫 fetch：網址、錯誤處理、逾時都集中在這裡（第 16 課的 API 層）。
// 要求：
//   1. createHttpMenuApi(baseUrl).getMenu({ signal }) 用 fetch(`${baseUrl}/menu`, { signal }) 取菜單
//   2. 回應不是 2xx 就丟出 Error，訊息帶狀態碼；成功就回傳解析後的 JSON
//   3. MENU_API、useMenuApi 已經寫好，元件用 useMenuApi() 拿 client
import { inject, type InjectionKey } from 'vue'

export type Product = { id: number; name: string; price: number; category: string }

export type MenuApi = {
  getMenu: (opts?: { signal?: AbortSignal }) => Promise<Product[]>
}
export const MENU_API: InjectionKey<MenuApi> = Symbol('MenuApi')

export function useMenuApi(): MenuApi {
  const api = inject(MENU_API, null)
  if (!api) throw new Error('useMenuApi() 找不到 MENU_API：要先在 createRootApp 裡 app.provide(MENU_API, api)')
  return api
}

export function createHttpMenuApi(baseUrl: string): MenuApi {
  return {
    getMenu: async () => {
      throw new Error(`TODO：把 MenuList.vue 裡呼叫 fetch 的程式搬到這裡（${baseUrl}）`)
    },
  }
}
