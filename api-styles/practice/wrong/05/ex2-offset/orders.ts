// 練習 2：顧客的訂單歷史，用 keyset（游標）分頁，回傳 Relay 的 Connection 形狀
import { GraphQLError } from 'graphql'
import type { Db } from '../../helpers/db.ts'
import { decodeCursor, encodeCursor } from './cursor.ts'

export type OrderRow = { id: number, customer_id: number, ordered_at: Date, total: number }
export type Edge = { cursor: string, node: OrderRow }
export type Connection = { edges: Edge[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }

const MAX_FIRST = 50

export async function ordersConnection(db: Db, customerId: string, args: { first?: number | null, after?: string | null }): Promise<Connection> {
  const first = args.first ?? 10
  if (!Number.isInteger(first) || first < 0 || first > MAX_FIRST) {
    throw new GraphQLError(`first 要是 0 到 ${MAX_FIRST} 之間的整數`, { extensions: { code: 'BAD_USER_INPUT' } })
  }
  // 多拿一筆：拿得到第 first + 1 筆，就代表還有下一頁
  const limit = first + 1
  // after 是客戶端傳來的，先解碼檢查；壞掉的游標在這裡就丟 BAD_USER_INPUT
  const offset = args.after == null ? 0 : Number(Buffer.from(args.after, 'base64url').toString())
  // 列比較：(ordered_at, id) 整組比較，同一時間的訂單再用 id 分先後
  const rows = await db.query<OrderRow>(
    `SELECT id, customer_id, ordered_at, total FROM orders
     WHERE customer_id = $1
     ORDER BY ordered_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [customerId, limit, offset])
  const page = rows.slice(0, first)
  const edges = page.map((node, i) => ({
    cursor: Buffer.from(String(offset + i + 1)).toString('base64url'),
    node,
  }))
  return {
    edges,
    pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null },
  }
}
