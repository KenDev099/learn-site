/*
練習 3：用 Zustand 寫購物車 store（useCartStore）
state：
  lines：CartLine[]，每列 { productId, quantity }，順序是第一次加入的順序；一開始是 []
  orderType：'here'（內用）| 'togo'（外帶），一開始是 'here'
action：
  add(productId)：已經有這個商品就數量 +1（最多 20），沒有就在最後加一列，數量 1
  changeQty(productId, quantity)：改成指定的數量；超過 20 當成 20；0 或負數就移除那一列
  setOrderType(type)：改內用／外帶
  clear()：所有 state 回到初始值（lines 清空、orderType 回到 'here'），action 都還能用
selector（寫在 store 外面的純函式，元件用 useCartStore(selectCount) 讀）：
  selectCount(state)：所有列的數量總和
  selectSubtotal(state)：每列「單價 × 數量」的總和，單價從 PRODUCTS 查
規則：
  - 不可變更新：不能改到舊的 state、舊的 lines 陣列或舊的列物件（測試會把它們凍結，改了會丟 TypeError）
  - 件數、小計是算出來的，不要存成 state
*/
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

export const useCartStore = create<CartState>()(() => ({
  lines: [],
  orderType: 'here',
  add: () => {},
  changeQty: () => {},
  setOrderType: () => {},
  clear: () => {},
}))

export const selectCount = (state: CartState) => 0
export const selectSubtotal = (state: CartState) => PRODUCTS.length * 0
