// 練習 2-4：購物車持久化外掛（features/cart，第 15 課）
// 問題：起始版把 storage 讀到的字串直接 JSON.parse、直接放回 store。
//       storage 是外部資料：壞掉的 JSON 讓整個 app 在啟動時當掉；舊版程式存的格式讓購物車出現沒有價格的列。
// 要求：persistCart({ storage, key }) 回傳 Pinia 外掛（pinia.use(persistCart(...))）
//   1. 只處理 $id 是 "cart" 的 store
//   2. store 建立時讀 storage.getItem(key)，格式是 { version: 1, lines }
//      lines 每一列：key 字串、productId 正整數、name 字串、size 是 M 或 L、sugar 是 normal、less 或 none、
//      qty 是 1～20 的整數、unitPrice 是 ≥ 0 的數字（cart-schema.ts 已經用 zod 寫好 savedCartSchema，可以直接用）
//   3. 合法就把 lines 放回 store；JSON 壞掉、version 不對、lines 不合法：removeItem(key)、從空車開始，不能丟錯
//   4. 之後 state 變動就寫入 JSON.stringify({ version: 1, lines })
//   5. storage 從參數傳入，不要直接用 localStorage
import type { PiniaPlugin } from 'pinia'
import { savedCartSchema } from './cart-schema.ts'

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function persistCart({ storage, key }: { storage: KeyValueStorage; key: string }): PiniaPlugin {
  return ({ store }) => {
    if (store.$id !== 'cart') return

    const raw = storage.getItem(key)
    if (raw !== null) {
      const data: unknown = JSON.parse(raw)
      const result = savedCartSchema.safeParse(data)
      if (result.success) store.$patch(state => { state.lines = result.data.lines })
      else storage.removeItem(key)
    }

    store.$subscribe((_mutation, state) => {
      storage.setItem(key, JSON.stringify({ version: 1, lines: state.lines }))
    })
  }
}
