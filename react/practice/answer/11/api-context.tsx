import { createContext, use, type ReactNode } from 'react'
import type { MenuApi } from './real-client.ts'

const ApiContext = createContext<MenuApi | null>(null)

export function ApiProvider({ api, children }: { api: MenuApi; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>
}

export function useApi(): MenuApi {
  const api = use(ApiContext)
  if (!api) throw new Error('useApi() 必須在 <ApiProvider> 之下使用')
  return api
}
