// 錯在：把 api 複製到 state：之後 prop 換了，state 還是第一次的 api
import { createContext, use, useState, type ReactNode } from 'react'
import type { MenuApi } from './real-client.ts'

const ApiContext = createContext<MenuApi | null>(null)

export function ApiProvider({ api, children }: { api: MenuApi; children: ReactNode }) {
  const [current] = useState(api)
  return <ApiContext value={current}>{children}</ApiContext>
}

export function useApi(): MenuApi {
  const api = use(ApiContext)
  if (!api) throw new Error('useApi() 必須在 <ApiProvider> 之下使用')
  return api
}
