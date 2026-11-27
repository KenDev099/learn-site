// 練習 4 用的點餐 store（已經寫好，這個檔案不用改）
import { create } from 'zustand'
import { PRODUCTS } from '../../helpers/fake-api.ts'

export type OrderLine = { productId: number; quantity: number }
export type OrderType = 'here' | 'togo'

export type OrderState = {
  lines: OrderLine[]
  orderType: OrderType
  note: string
  add: (productId: number) => void
  setOrderType: (type: OrderType) => void
  setNote: (note: string) => void
}

export const useOrderStore = create<OrderState>()(set => ({
  lines: [],
  orderType: 'here',
  note: '',
  add: productId => set(state => ({
    lines: state.lines.some(l => l.productId === productId)
      ? state.lines.map(l => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
      : [...state.lines, { productId, quantity: 1 }],
  })),
  setOrderType: orderType => set({ orderType }),
  setNote: note => set({ note }),
}))

const priceOf = (productId: number) => PRODUCTS.find(p => p.id === productId)?.price ?? 0

export const selectCount = (state: OrderState) => state.lines.reduce((sum, l) => sum + l.quantity, 0)
export const selectSubtotal = (state: OrderState) => state.lines.reduce((sum, l) => sum + priceOf(l.productId) * l.quantity, 0)
