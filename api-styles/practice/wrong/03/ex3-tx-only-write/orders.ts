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
  const wanted = new Map<string, number>()
  for (const l of lines) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity)
  // ✗ 檢查在交易外面，只有寫入放進交易：兩個請求都可能通過檢查
  for (const [productId, quantity] of wanted) {
    const available = await db.stockOf(productId)
    if (available < quantity) return { __typename: 'OutOfStock', productId, available }
  }
  return db.transaction(async tx => {
    const priced = []
    for (const l of lines) {
      const product = await tx.productById(l.productId)
      priced.push({ ...l, unitPrice: product!.price })
    }
    for (const [productId, quantity] of wanted) await tx.takeStock(productId, quantity)
    return { __typename: 'OrderPlaced', order: await tx.insertOrder(customerId, priced) }
  })
}
