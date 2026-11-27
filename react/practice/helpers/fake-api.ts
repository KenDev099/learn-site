// 咖啡店的假 API：不連網路，記錄每一次呼叫（含收到的 AbortSignal）
// createFakeMenuApi()：每個呼叫在下一個 microtask 自動成功
// createFakeMenuApi({ manual: true })：呼叫一直等著，由測試用 api.calls[i].resolve() / reject() 決定何時、以什麼結果完成
import { deferred } from './deferred.ts'

export type Category = 'coffee' | 'tea' | 'food'
export type Product = { id: number; name: string; price: number; category: Category }
export type Customer = { id: number; name: string }
export type Store = { id: number; name: string }

export const PRODUCTS: readonly Product[] = [
  { id: 1, name: '美式咖啡', price: 80, category: 'coffee' },
  { id: 2, name: '拿鐵', price: 110, category: 'coffee' },
  { id: 3, name: '卡布奇諾', price: 110, category: 'coffee' },
  { id: 4, name: '伯爵紅茶', price: 90, category: 'tea' },
  { id: 5, name: '可頌', price: 70, category: 'food' },
  { id: 6, name: '起司蛋糕', price: 120, category: 'food' },
]
export const CUSTOMERS: readonly Customer[] = ['王小明', '陳美華', '林志豪', '張雅婷', '李建國', '黃淑芬'].map((name, i) => ({ id: i + 1, name }))
export const STORES: readonly Store[] = [{ id: 1, name: '總店' }, { id: 2, name: '分店' }]

export type ApiCall = {
  method: string
  args: unknown[]
  signal?: AbortSignal
  /** 手動模式：以 value 完成（不給就用預設的假資料） */
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}
type Opts = { signal?: AbortSignal }

export class NotFoundError extends Error {
  status = 404
}

export function createFakeMenuApi({ manual = false } = {}) {
  const calls: ApiCall[] = []

  function call<T>(method: string, args: unknown[], signal: AbortSignal | undefined, result: () => T): Promise<T> {
    const d = deferred<T>()
    const record: ApiCall = {
      method, args, signal,
      resolve: value => {
        try { d.resolve(value === undefined ? result() : (value as T)) } catch (e) { d.reject(e) }
      },
      reject: d.reject,
    }
    calls.push(record)
    if (signal?.aborted) d.reject(signal.reason)
    signal?.addEventListener('abort', () => d.reject(signal.reason), { once: true })
    if (!manual) queueMicrotask(() => record.resolve())
    return d.promise
  }
  const copy = <T>(v: T): T => structuredClone(v)
  const product = (id: number) => {
    const p = PRODUCTS.find(p => p.id === id)
    if (!p) throw new NotFoundError(`找不到商品 ${id}`)
    return copy(p)
  }

  return {
    calls,
    /** 某個方法被呼叫的紀錄 */
    callsOf: (method: string) => calls.filter(c => c.method === method),
    getMenu: (opts: Opts = {}) => call('getMenu', [], opts.signal, () => copy(PRODUCTS) as Product[]),
    getProduct: (id: number, opts: Opts = {}) => call('getProduct', [id], opts.signal, () => product(id)),
    search: (keyword: string, opts: Opts = {}) =>
      call('search', [keyword], opts.signal, () => copy(PRODUCTS.filter(p => p.name.includes(keyword))) as Product[]),
    getCustomers: (opts: Opts = {}) => call('getCustomers', [], opts.signal, () => copy(CUSTOMERS) as Customer[]),
    getStores: (opts: Opts = {}) => call('getStores', [], opts.signal, () => copy(STORES) as Store[]),
  }
}
export type FakeMenuApi = ReturnType<typeof createFakeMenuApi>
