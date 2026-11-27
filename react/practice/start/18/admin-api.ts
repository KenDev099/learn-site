// 練習 3 的假後端與登入狀態（不用改）：不連網路，每個呼叫在下一個 microtask 成功，記錄每一次呼叫
export type Role = 'barista' | 'manager'
export type User = { id: number; name: string; role: Role; storeId: number }
/** 目前登入的人：null 是沒登入。測試會直接改它（登入、登出） */
export type Auth = { user: User | null }
export type Order = { id: number; customer: string; total: number }
export type PriceRow = { name: string; price: number }

type Opts = { signal?: AbortSignal }
export type AdminCall = { method: string; args: unknown[]; signal?: AbortSignal }

export const BARISTA: User = { id: 2, name: '陳美華', role: 'barista', storeId: 2 }
export const MANAGER: User = { id: 1, name: '王小明', role: 'manager', storeId: 1 }

const ORDERS: Record<number, Order[]> = {
  1: [{ id: 101, customer: '林志豪', total: 190 }],
  2: [{ id: 201, customer: '張雅婷', total: 110 }, { id: 202, customer: '李建國', total: 160 }],
}

export function createAdminApi() {
  const calls: AdminCall[] = []
  const call = <T>(method: string, args: unknown[], opts: Opts, value: T): Promise<T> => {
    calls.push({ method, args, signal: opts.signal })
    return new Promise(resolve => queueMicrotask(() => resolve(structuredClone(value))))
  }
  return {
    calls,
    callsOf: (method: string) => calls.filter(c => c.method === method),
    /** 某間門市的訂單 */
    getOrders: (storeId: number, opts: Opts = {}) => call('getOrders', [storeId], opts, ORDERS[storeId] ?? []),
    /** 價目表（只有店長能改） */
    getPrices: (opts: Opts = {}) => call('getPrices', [], opts, [{ name: '拿鐵', price: 110 }, { name: '可頌', price: 70 }] as PriceRow[]),
  }
}
export type AdminApi = ReturnType<typeof createAdminApi>
