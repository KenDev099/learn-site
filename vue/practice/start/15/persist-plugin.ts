// 練習 3：persistPlugin 把購物車存到 storage
// 問題：客人重新整理頁面，購物車就空了。要把購物車存進 localStorage，下次開頁面時讀回來。
//       但 storage 裡的東西是「外部資料」：可能是壞掉的 JSON、舊版程式存的格式，或被手動改過。
// 要求：persistPlugin({ storage, key }) 回傳一個 Pinia 外掛（用 pinia.use() 註冊）
//   1. 只處理 $id 是 'cart' 的 store，其他 store 完全不碰
//   2. store 建立時讀 storage.getItem(key)，格式是 { version: 1, items }
//      items 每一列要是 { id: 數字, name: 字串, price: 數字, qty: 1～20 的整數 }
//   3. 合法就把 items 放回 store；JSON 壞掉、version 不是 1、items 不合法：storage.removeItem(key)，從空車開始，不能丟錯
//   4. 之後 state 每次變動就寫入 JSON.stringify({ version: 1, items })：只存 items，不存 orderType 或整個 store
//   5. storage 從參數傳入（測試會給假的），不要直接用 localStorage
import type { PiniaPlugin } from 'pinia'

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Options = { storage: KeyValueStorage; key: string }

export function persistPlugin({ storage, key }: Options): PiniaPlugin {
  return ({ store }) => {
    const saved = JSON.parse(storage.getItem(key) ?? 'null')
    if (saved) store.$patch({ items: saved.items })
    store.$subscribe((_mutation, state) => {
      storage.setItem(key, JSON.stringify(state))
    })
  }
}
