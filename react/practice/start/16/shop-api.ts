// 第 16 課的假後端：不連網路，記得伺服器上的資料，記錄每一次呼叫
// createShopApi()：每個呼叫在下一個 microtask 自動完成
// createShopApi({ manual: true })：呼叫一直等著，由測試用 api.calls[i].resolve() / reject() 決定何時、以什麼結果完成
// 寫入（updatePrice、setFavorite、addNote）在 resolve 的那一刻才改伺服器上的資料；reject 就是伺服器沒有改
// 回傳的資料都是凍結的（Object.freeze）：直接改它（push、p.price = …）會丟 TypeError，要建立新的陣列或物件
import { deferred } from '../../helpers/deferred.ts'

export type Product = { id: number; name: string; price: number }
export type Note = { id: number; text: string }

export const PRODUCTS: readonly Product[] = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]

export type ApiCall = {
  method: string
  args: unknown[]
  /** 已經完成（成功或失敗）了 */
  done: boolean
  /** 手動模式：完成這次呼叫（不給 value 就照伺服器的規則算出結果） */
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

export function createShopApi({ manual = false, favorites = [] as number[], notes = [] as Note[] } = {}) {
  const server = {
    products: PRODUCTS.map(p => ({ ...p })),
    favorites: [...favorites],
    notes: notes.map(n => ({ ...n })),
    nextNoteId: Math.max(0, ...notes.map(n => n.id)) + 1,
  }
  const calls: ApiCall[] = []

  function call<T>(method: string, args: unknown[], result: () => T): Promise<T> {
    const d = deferred<T>()
    const record: ApiCall = {
      method, args, done: false,
      resolve: value => {
        if (record.done) return
        record.done = true
        try { d.resolve(freeze(structuredClone(value === undefined ? result() : (value as T)))) } catch (e) { d.reject(e) }
      },
      reject: reason => {
        if (record.done) return
        record.done = true
        d.reject(reason)
      },
    }
    calls.push(record)
    if (!manual) queueMicrotask(() => record.resolve())
    return d.promise
  }
  const find = (id: number) => {
    const p = server.products.find(p => p.id === id)
    if (!p) throw new Error(`找不到商品 ${id}`)
    return p
  }

  return {
    calls,
    /** 某個方法被呼叫的紀錄 */
    callsOf: (method: string) => calls.filter(c => c.method === method),
    /** 某個方法還沒完成的呼叫 */
    pendingOf: (method: string) => calls.filter(c => c.method === method && !c.done),
    /** 伺服器上目前的資料（測試用來確認後端真的改了） */
    server,
    getProducts: (): Promise<Product[]> => call('getProducts', [], () => server.products),
    getProduct: (id: number): Promise<Product> => call('getProduct', [id], () => find(id)),
    updatePrice: (id: number, price: number): Promise<Product> => call('updatePrice', [id, price], () => {
      if (!Number.isInteger(price) || price <= 0) throw new Error('價格必須是正整數')
      const p = find(id)
      p.price = price
      return p
    }),
    getFavorites: (): Promise<number[]> => call('getFavorites', [], () => server.favorites),
    setFavorite: (productId: number, on: boolean): Promise<{ productId: number; on: boolean }> =>
      call('setFavorite', [productId, on], () => {
        server.favorites = on
          ? [...new Set([...server.favorites, productId])]
          : server.favorites.filter(id => id !== productId)
        return { productId, on }
      }),
    getNotes: (): Promise<Note[]> => call('getNotes', [], () => server.notes),
    addNote: (text: string): Promise<Note> => call('addNote', [text], () => {
      const note = { id: server.nextNoteId++, text: text.trim() }
      server.notes = [...server.notes, note]
      return note
    }),
  }
}
export type ShopApi = ReturnType<typeof createShopApi>
