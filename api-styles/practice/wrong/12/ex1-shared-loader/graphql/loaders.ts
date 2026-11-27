// 練習 1：這個請求專用的 DataLoader。每個 batch 函式只發出一句 SQL（WHERE … = ANY($1)），
// 回傳的陣列跟 keys 一樣長、一樣順序；找不到的位置放 null（itemsByOrderId 放 []）
import DataLoader from 'dataloader'
import type { Db } from '../../../helpers/db.ts'
import type { CustomerRow, ItemRow, ProductRow } from './context.ts'

let shared: ReturnType<typeof make> | undefined
// ✗ 第一次建立後就一直重用：快取跨請求共用，資料改了也看不到
export function createLoaders(db: Db) {
  return shared ??= make(db)
}

function make(db: Db) {
  return {
    customerById: new DataLoader<number, CustomerRow | null>(async ids => {
      const rows = await db.query<CustomerRow>('SELECT id, name, email FROM customers WHERE id = ANY($1)', [ids])
      const byId = new Map(rows.map(r => [r.id, r]))
      return ids.map(id => byId.get(id) ?? null)
    }),
    productById: new DataLoader<number, ProductRow | null>(async ids => {
      const rows = await db.query<ProductRow>('SELECT id, name, price, category FROM products WHERE id = ANY($1)', [ids])
      const byId = new Map(rows.map(r => [r.id, r]))
      return ids.map(id => byId.get(id) ?? null)
    }),
    itemsByOrderId: new DataLoader<number, ItemRow[]>(async orderIds => {
      const rows = await db.query<ItemRow>(
        'SELECT order_id, product_id, quantity, unit_price FROM order_items WHERE order_id = ANY($1) ORDER BY order_id, product_id', [orderIds])
      const byOrder = Map.groupBy(rows, r => r.order_id)
      return orderIds.map(id => byOrder.get(id) ?? [])
    }),
  }
}

export type Loaders = ReturnType<typeof createLoaders>
