// 測試共用：每個測試一個全新的 QueryClient 和假後端（手動模式），不會互相影響
import type { ReactNode } from 'react'
import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createShopApi, type ApiCall, type ShopApi } from './shop-api.ts'

const apis: ShopApi[] = []

export function setup(ui: (api: ShopApi) => ReactNode, options: Parameters<typeof createShopApi>[0] = {}) {
  const api = createShopApi({ ...options, manual: true })
  apis.push(api)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}>{ui(api)}</QueryClientProvider>)
  return { api, client, user: userEvent.setup(), ...view }
}

/** 等 TanStack Query 與 React 把畫面更新完（TanStack Query 用 setTimeout(0) 批次通知） */
export const settle = () => act(async () => {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0))
})

/** 讓某次呼叫成功（不給 value 就照伺服器的規則算），再等畫面更新完 */
export async function resolve(call: ApiCall | undefined, value?: unknown) {
  if (!call) throw new Error('找不到這次 API 呼叫：該送出的請求沒有送出')
  await act(async () => call.resolve(value))
  await settle()
}

/** 讓某次呼叫失敗，再等畫面更新完 */
export async function reject(call: ApiCall | undefined, error = new Error('網路連線中斷')) {
  if (!call) throw new Error('找不到這次 API 呼叫：該送出的請求沒有送出')
  await act(async () => call.reject(error))
  await settle()
}

/** 把某個方法還沒完成的呼叫全部照伺服器的規則完成（完成時又送出的新呼叫也一起） */
export async function resolvePending(api: ShopApi, method: string) {
  for (let i = 0; i < 10 && api.pendingOf(method).length; i++) {
    for (const c of api.pendingOf(method)) await resolve(c)
  }
}

/** 測試結束前把還在等的呼叫全部結束掉：React 會把進行中的 Transition 合在一起，留著沒結束的會卡住下一個測試 */
export async function finishAll() {
  for (const api of apis.splice(0)) {
    for (const c of api.calls) if (!c.done) await act(async () => c.reject(new Error('測試結束')))
  }
  await settle()
}
