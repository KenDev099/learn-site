// 錯在：api 存在模組層級的變數：第一個 ApiProvider 設定過之後，沒有 Provider 也讀得到，巢狀時也會互相蓋掉
import { type ReactNode } from 'react'
import type { MenuApi } from './real-client.ts'

let current: MenuApi | null = null

export function ApiProvider({ api, children }: { api: MenuApi; children: ReactNode }) {
  current = api
  return <>{children}</>
}

export function useApi(): MenuApi {
  const api = current
  if (!api) throw new Error('useApi() 必須在 <ApiProvider> 之下使用')
  return api
}
