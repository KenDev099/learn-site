// 測試共用（不用改）：假後端、每個測試一個新的 QueryClient、只存在記憶體的路由器
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider, useLocation, type RouteObject } from 'react-router'
import { deferred } from '../../helpers/deferred.ts'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import type { Order, ShopApi } from './shared/api.ts'

export type ApiCall = {
  method: string
  args: unknown[]
  signal?: AbortSignal
  done: boolean
  /** 完成這次呼叫（不給 value 就用預設的假資料） */
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) freeze(v)
  }
  return value
}

export const ORDERS: Order[] = [
  { id: 1, customer: '王小明', storeId: 1, status: 'brewing', total: 260, lines: [{ name: '可頌', quantity: 1 }, { name: '拿鐵', quantity: 2 }] },
  { id: 2, customer: '陳美華', storeId: 1, status: 'received', total: 90, lines: [{ name: '伯爵紅茶', quantity: 1 }] },
  { id: 3, customer: '林志豪', storeId: 2, status: 'brewing', total: 120, lines: [{ name: '起司蛋糕', quantity: 1 }] },
]

/**
 * 假後端：每個呼叫都等著，由測試用 api.calls[i].resolve() / reject() 決定何時完成。
 * 回傳的資料都是凍結的：直接改它（sort、push、o.status = …）會丟 TypeError。
 */
export function createFakeShop() {
  const calls: ApiCall[] = []
  function call<T>(method: string, args: unknown[], signal: AbortSignal | undefined, fallback: () => T): Promise<T> {
    const d = deferred<T>()
    const record: ApiCall = {
      method, args, signal, done: false,
      resolve: value => {
        if (record.done) return
        record.done = true
        try { d.resolve(freeze(structuredClone(value === undefined ? fallback() : (value as T)))) } catch (e) { d.reject(e) }
      },
      reject: reason => {
        if (record.done) return
        record.done = true
        d.reject(reason)
      },
    }
    calls.push(record)
    signal?.addEventListener('abort', () => record.reject(signal.reason), { once: true })
    return d.promise
  }
  const order = (id: number) => {
    const o = ORDERS.find(o => o.id === id)
    if (!o) throw new Error(`找不到訂單 ${id}`)
    return o
  }
  const api: ShopApi = {
    getCategory: (category, opts = {}) => call('getCategory', [category], opts.signal, () => PRODUCTS.filter(p => p.category === category)),
    createOrder: (input, key) => call('createOrder', [input, key], undefined, () => ({ id: 77 })),
    getOrder: (id, opts = {}) => call('getOrder', [id], opts.signal, () => order(id)),
    getStoreOrders: (storeId, opts = {}) => call('getStoreOrders', [storeId], opts.signal, () => ORDERS.filter(o => o.storeId === storeId)),
    markReady: orderId => call('markReady', [orderId], undefined, () => ({ ...order(orderId), status: 'ready' as const })),
  }
  return {
    api,
    calls,
    callsOf: (method: string) => calls.filter(c => c.method === method),
    pendingOf: (method: string) => calls.filter(c => c.method === method && !c.done),
  }
}
export type FakeShop = ReturnType<typeof createFakeShop>

/** 等 TanStack Query、路由器與 React 把畫面更新完（TanStack Query 用 setTimeout(0) 批次通知） */
export const settle = () => act(async () => {
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0))
})

/** 讓某次呼叫成功（不給 value 就用預設的假資料），再等畫面更新完 */
export async function resolve(call: ApiCall | undefined, value?: unknown) {
  if (!call) throw new Error('找不到這次 API 呼叫：該送出的請求沒有送出')
  await act(async () => call.resolve(value))
  await settle()
}

/** 讓某次呼叫失敗，再等畫面更新完 */
export async function reject(call: ApiCall | undefined, error: unknown = new TypeError('Failed to fetch')) {
  if (!call) throw new Error('找不到這次 API 呼叫：該送出的請求沒有送出')
  await act(async () => call.reject(error))
  await settle()
}

/** 測試用的外層版面：目前網址（含 query）、底下放題目的路由 */
function Shell() {
  const location = useLocation()
  return (
    <>
      <output aria-label="網址">{location.pathname}{location.search}</output>
      <Outlet />
    </>
  )
}

/**
 * 用記憶體路由器 render 題目的路由，外面包一個新的 QueryClient（關掉重試）。
 * '/' 底下另外有 /login（登入頁）與 /orders/:id（訂單頁的替身）
 */
export function renderApp(routes: RouteObject[], ...entries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{
    path: '/',
    Component: Shell,
    HydrateFallback: () => <p>準備中…</p>,
    ErrorBoundary: () => <p role="alert">外層錯誤</p>,
    children: [
      { index: true, Component: () => <h1>首頁</h1> },
      { path: 'login', Component: () => <h1>登入頁</h1> },
      ...routes,
    ],
  }], { initialEntries: entries, initialIndex: entries.length - 1 })
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  const go = async (to: string | number) => {
    await act(async () => { void router.navigate(to as string) })
    await settle()
  }
  return { router, client, go, user: userEvent.setup(), ...view }
}

/** 目前的網址（解碼後），例如 /login?redirect=/staff/1 */
export const currentUrl = () => decodeURIComponent(screen.getByRole('status', { name: '網址' }).textContent ?? '')
/** 目前網址的 query，轉成物件 */
export const currentQuery = () => Object.fromEntries(new URLSearchParams(currentUrl().split('?')[1] ?? ''))
