// 練習 1：顧客的訂單歷史，keyset（游標）分頁，回傳 Connection（第 5 課）
import { GraphQLError } from 'graphql'
import type { Db } from '../../../helpers/db.ts'
import type { OrderRow } from './context.ts'
import { decodeCursor, encodeCursor } from './cursor.ts'

export type Connection = { edges: { cursor: string, node: OrderRow }[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }

export const MAX_FIRST = 50
export const EMPTY: Connection = { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }

export function checkFirst(first: number) {
  if (!Number.isInteger(first) || first < 0 || first > MAX_FIRST) {
    throw new GraphQLError(`first 要是 0 到 ${MAX_FIRST} 之間的整數`, { extensions: { code: 'BAD_USER_INPUT' } })
  }
}

export async function ordersConnection(db: Db, customerId: number | string, args: { first: number, after?: string | null }): Promise<Connection> {
  checkFirst(args.first)
  const key = args.after == null ? null : decodeCursor(args.after)
  // 多拿一筆判斷有沒有下一頁；(ordered_at, id) 整組比較，同一時間的訂單再用 id 分先後
  const rows = await db.query<OrderRow>(
    `SELECT id, customer_id, ordered_at, total, internal_note FROM orders
     WHERE customer_id = $1 ${key ? 'AND (ordered_at, id) < ($3, $4)' : ''}
     ORDER BY ordered_at DESC, id DESC
     LIMIT $2`,
    key ? [customerId, args.first + 1, key.orderedAt, key.id] : [customerId, args.first + 1])
  const edges = rows.slice(0, args.first).map(node => ({
    cursor: encodeCursor({ orderedAt: node.ordered_at.toISOString(), id: String(node.id) }),
    node,
  }))
  return { edges, pageInfo: { hasNextPage: rows.length > args.first, endCursor: edges.at(-1)?.cursor ?? null } }
}
