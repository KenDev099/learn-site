/// <reference types="vite/client" />
// 「真正的」API client：正式環境用 fetch 連到後端。這個檔案不用改。
// 測試環境（Vitest 的 MODE 是 'test'）一被呼叫就丟錯，用來確認元件沒有直接 import 它
import type { Product } from '../../helpers/fake-api.ts'

export type MenuApi = {
  getMenu: (opts?: { signal?: AbortSignal }) => Promise<Product[]>
}

export const realClient: MenuApi = {
  async getMenu({ signal } = {}) {
    if (import.meta.env.MODE === 'test') {
      throw new Error('測試環境不能呼叫真正的 API：元件要透過 useApi() 取得 client，不要直接 import realClient')
    }
    const res = await fetch('/api/menu', { signal })
    if (!res.ok) throw new Error(`GET /api/menu 失敗：${res.status}`)
    return res.json() as Promise<Product[]>
  },
}
