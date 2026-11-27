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
  add: productId => set(state => ({
    lines: state.lines.some(l => l.productId === productId)
      ? state.lines.map(l => (l.productId === productId ? { ...l, quantity: Math.min(l.quantity + 1, MAX) } : l))
      : [...state.lines, { productId, quantity: 1 }],
  })),
  changeQty: (productId, quantity) => set(state => ({
    lines: state.lines.map(l => (l.productId === productId ? { ...l, quantity: Math.max(0, Math.min(quantity, MAX)) } : l)),
  })),
  setOrderType: orderType => set({ orderType }),
  // 初始 state（含 action）整個合併回去：之後新增的 state 也不會漏掉
  clear: () => set(store.getInitialState()),
}))

const priceOf = (productId: number) => PRODUCTS.find(p => p.id === productId)?.price ?? 0

export const selectCount = (state: CartState) => state.lines.reduce((sum, l) => sum + l.quantity, 0)
export const selectSubtotal = (state: CartState) => state.lines.reduce((sum, l) => sum + priceOf(l.productId) * l.quantity, 0)
