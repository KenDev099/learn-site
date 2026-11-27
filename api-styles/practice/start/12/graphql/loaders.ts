// 練習 1：這個請求專用的 DataLoader（第 4 課）。app.ts 每個請求呼叫一次 createLoaders(db)
// 要做到：
// - customerById、productById：key 是 id（數字），找不到放 null
// - itemsByOrderId：key 是訂單 id，值是這張訂單的品項陣列（依 product_id 排序），沒有品項放 []
// - 每個 batch 函式只發出一句 SQL（WHERE … = ANY($1)），回傳的陣列跟 keys 一樣長、一樣順序
// - 不要在模組層級建立或保存 loader：快取只能活在一個請求裡
import type { Db } from '../../../helpers/db.ts'

export function createLoaders(db: Db) {
  void db
  return {}
}

export type Loaders = ReturnType<typeof createLoaders>
