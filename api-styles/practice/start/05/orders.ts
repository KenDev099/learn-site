// 練習 2：顧客的訂單歷史，用 keyset（游標）分頁，回傳 Relay 的 Connection 形狀
import { GraphQLError } from 'graphql'
import type { Db } from '../../helpers/db.ts'
import { decodeCursor, encodeCursor } from './cursor.ts'

export type OrderRow = { id: number, customer_id: number, ordered_at: Date, total: number }
export type Edge = { cursor: string, node: OrderRow }
export type Connection = { edges: Edge[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }

export async function ordersConnection(db: Db, customerId: string, args: { first?: number | null, after?: string | null }): Promise<Connection> {
  // ✗ 起始程式：一次查出全部訂單，沒有分頁
  const rows = await db.query<OrderRow>(
    'SELECT id, customer_id, ordered_at, total FROM orders WHERE customer_id = $1 ORDER BY ordered_at DESC',
    [customerId])
  return {
    edges: rows.map(node => ({ cursor: String(node.id), node })),
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}
