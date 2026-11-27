// 練習 2：用 buf generate 產生的程式碼編碼、解碼庫存
// 練習 1 完成後，gen/coffee/inventory/v1/inventory_pb.js 才會有 StockLevelSchema、GetStockResponseSchema
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { GetStockResponseSchema, StockLevelSchema } from './gen/coffee/inventory/v1/inventory_pb.js'

export type Stock = { productId: string; available: number; reorderPoint?: number }

// 把多筆庫存編成一個 GetStockResponse（levels 的 key 是 productId）的位元組
export function encodeStock(levels: Stock[]): Uint8Array {
  const map = Object.fromEntries(levels.map(l => [l.productId, create(StockLevelSchema, l)]))
  return toBinary(GetStockResponseSchema, create(GetStockResponseSchema, { levels: map }))
}

// 把 GetStockResponse 的位元組解回 Stock 陣列；沒設定 reorder_point 的不能出現 0
export function decodeStock(bytes: Uint8Array): Stock[] {
  const res = fromBinary(GetStockResponseSchema, bytes)
  return Object.values(res.levels).map(({ productId, available, reorderPoint }) =>
    reorderPoint === undefined ? { productId, available } : { productId, available, reorderPoint })
}

// 把一筆 StockLevel 編成位元組，回傳小寫十六進位字串（不含空白），例如 '0a013210ac02'
export function toWireHex(level: Stock): string {
  return Buffer.from(toBinary(StockLevelSchema, create(StockLevelSchema, level))).toString('hex')
}
