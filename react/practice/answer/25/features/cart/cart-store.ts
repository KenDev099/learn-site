/*
練習 2（上）：購物車 store（第 14 課的 Zustand 與 persist、第 20 課的不可變更新）
驗收條件：
  1. add(product, { size, sugar })：商品＋大小＋甜度都一樣才算同一列，數量 +1（最多 20）；不一樣就在最後加一列。
     key 用 lineKey() 算；單價是商品價格，大杯（L）+20
  2. changeQty(key, quantity)：改那一列的數量（超過 20 當成 20），0 或負數移除那一列
  3. clear()：回到初始值；action 之後還能用
  4. 一律不可變更新：不 push、不改舊的列物件
  5. 持久化：用 persist 存進 localStorage 的 'cart'，version 1（舊版本的資料不要用）。
     讀回來的資料是外部輸入：用 cart-schema.ts 的 persistedCartSchema 驗證（在 merge 裡），
     不合法（lines 是 null、某一列數量是 -3、少了欄位……）就整個不用，從空車開始；JSON 壞掉也不能讓 app 當掉
  6. selectCount、selectSubtotal 從 lines 算出件數與小計（不要存成 state）
*/
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartLine, CartOptions, Product } from '../../shared/api.ts'
import { persistedCartSchema } from './cart-schema.ts'

export type CartState = {
  lines: CartLine[]
  add: (product: Product, options: CartOptions) => void
  changeQty: (key: string, quantity: number) => void
  clear: () => void
}

const MAX = 20

export const lineKey = (productId: number, { size, sugar }: CartOptions) => `${productId}-${size}-${sugar}`

export const useCartStore = create<CartState>()(persist((set, _get, store) => ({
  lines: [],
  add: (product, options) => set(state => {
    const key = lineKey(product.id, options)
    return {
      lines: state.lines.some(l => l.key === key)
        ? state.lines.map(l => (l.key === key ? { ...l, quantity: Math.min(l.quantity + 1, MAX) } : l))
        : [...state.lines, {
            key, productId: product.id, name: product.name, ...options,
            unitPrice: product.price + (options.size === 'L' ? 20 : 0), quantity: 1,
          }],
    }
  }),
  changeQty: (key, quantity) => set(state => ({
    lines: quantity <= 0
      ? state.lines.filter(l => l.key !== key)
      : state.lines.map(l => (l.key === key ? { ...l, quantity: Math.min(quantity, MAX) } : l)),
  })),
  clear: () => set(store.getInitialState()),
}), {
  name: 'cart',
  version: 1,
  partialize: state => ({ lines: state.lines }),   // 只存資料：之後加了不該存的 state 也不會被寫進去
  // 讀回來的資料先驗證：合法才用，不合法就維持初始值（空車）
  merge: (persisted, current) => {
    const parsed = persistedCartSchema.safeParse(persisted)
    return parsed.success ? { ...current, lines: parsed.data.lines } : current
  },
}))

export const selectCount = (state: CartState) => state.lines.reduce((sum, l) => sum + l.quantity, 0)
export const selectSubtotal = (state: CartState) => state.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
