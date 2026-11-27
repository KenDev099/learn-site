// 菜單 API 的注入（練習 2 用到，不用改）：正式環境由 main.ts 提供真的 client，測試提供假的
import { inject, type InjectionKey } from 'vue'
import type { Product } from '../../helpers/fake-api.ts'

export type MenuApi = {
  getProduct: (id: number, opts?: { signal?: AbortSignal }) => Promise<Product>
}
export const MENU_API: InjectionKey<MenuApi> = Symbol('MenuApi')

export function useMenuApi(): MenuApi {
  const api = inject(MENU_API, null)
  if (!api) throw new Error('useMenuApi() 找不到 MENU_API：要先 provide(MENU_API, client)')
  return api
}
