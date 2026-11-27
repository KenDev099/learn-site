// 練習 3：下單的商業邏輯（服務層）。resolver 只負責把參數交給這裡、把結果交回去
import type { Db } from './db.ts'

export type OrderLine = { productId: string, quantity: number }

export async function placeOrder(db: Db, customerId: string, lines: OrderLine[]): Promise<unknown> {
  throw new Error('還沒實作 placeOrder')
}

