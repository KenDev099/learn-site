// 錯在：realClient 當預設值、讀到也不丟錯：忘了放 ApiProvider 時偷偷連到正式後端
import { createContext, use, type ReactNode } from 'react'
import { realClient, type MenuApi } from './real-client.ts'

const ApiContext = createContext<MenuApi>(realClient)

export function ApiProvider({ api, children }: { api: MenuApi; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>
}

export function useApi(): MenuApi {
  return use(ApiContext)
}
