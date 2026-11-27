// 練習 3：下單的商業邏輯（服務層）。resolver 只負責把參數交給這裡、把結果交回去
import type { Db, OrderRow } from './db.ts'

export type OrderLine = { productId: string, quantity: number }

// 預期中的結果都是回傳值；__typename 告訴 GraphQL 這是 union 裡的哪一個型別
export type PlaceOrderResult =
  | { __typename: 'OrderPlaced', order: OrderRow }
  | { __typename: 'OutOfStock', productId: string, available: number }
  | { __typename: 'InvalidQuantity', productId: string, quantity: number }

export async function placeOrder(db: Db, customerId: string, lines: OrderLine[]): Promise<PlaceOrderResult> {
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 20) {
      return { __typename: 'InvalidQuantity', productId: l.productId, quantity: l.quantity }
    }
  }
  // 檢查和寫入在同一個交易裡：檢查完到寫入之前，別的下單不能插進來
  // ✗ 一行一行檢查、一行一行扣：第二行失敗時，第一行已經扣了（回傳結果不是丟錯，交易照樣提交）
  return db.transaction(async tx => {
    const priced = []
    for (const l of lines) {
      const available = await tx.stockOf(l.productId)
      if (available < l.quantity) return { __typename: 'OutOfStock', productId: l.productId, available }
      await tx.takeStock(l.productId, l.quantity)
      priced.push({ ...l, unitPrice: (await tx.productById(l.productId))!.price })
    }
    return { __typename: 'OrderPlaced', order: await tx.insertOrder(customerId, priced) }
  })
}
