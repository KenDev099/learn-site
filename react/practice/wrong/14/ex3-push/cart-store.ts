import { create } from 'zustand'
import { PRODUCTS } from '../../helpers/fake-api.ts'

export type CartLine = { productId: number; quantity: number }
export type OrderType = 'here' | 'togo'

export type CartState = {
  lines: CartLine[]
  orderType: OrderType
  add: (productId: number) => void
  changeQty: (productId: number, quantity: number) => void
  setOrderType: (type: OrderType) => void
  clear: () => void
}

const MAX = 20

export const useCartStore = create<CartState>()((set, _get, store) => ({
  lines: [],
  orderType: 'here',
  // set 只合併第一層：回傳 { lines } 就好，orderType 和 action 會保留
  add: productId => set(state => {
    const line = state.lines.find(l => l.productId === productId)
    if (line) line.quantity = Math.min(line.quantity + 1, MAX)
    else state.lines.push({ productId, quantity: 1 })
    return { lines: state.lines }
  }),
  changeQty: (productId, quantity) => set(state => ({
    lines: quantity <= 0
      ? state.lines.filter(l => l.productId !== productId)
      : state.lines.map(l => (l.productId === productId ? { ...l, quantity: Math.min(quantity, MAX) } : l)),
  })),
  setOrderType: orderType => set({ orderType }),
  // 初始 state（含 action）整個合併回去：之後新增的 state 也不會漏掉
  clear: () => set(store.getInitialState()),
}))

const priceOf = (productId: number) => PRODUCTS.find(p => p.id === productId)?.price ?? 0

export const selectCount = (state: CartState) => state.lines.reduce((sum, l) => sum + l.quantity, 0)
export const selectSubtotal = (state: CartState) => state.lines.reduce((sum, l) => sum + priceOf(l.productId) * l.quantity, 0)
