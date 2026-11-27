// 資料庫一列的型別（不用改）。PGlite 回傳的 integer 欄位是 number、timestamptz 是 Date
export type CustomerRow = { id: number, name: string }
export type ProductRow = { id: number, name: string, price: number, category: string }
export type OrderRow = { id: number, customer_id: number, ordered_at: Date, total: number }
export type ItemRow = { order_id: number, product_id: number, quantity: number, unit_price: number }
