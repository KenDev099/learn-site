// 練習 1：顧客的訂單歷史，回傳 Connection（第 5 課）
// ✗ 目前用 OFFSET：游標只是「第幾筆」，翻頁時有新訂單進來，下一頁會重複出現上一頁的最後一筆
// 要改成 keyset：用 cursor.ts 的 encodeCursor／decodeCursor，條件 (ordered_at, id) < (游標的值)
import { GraphQLError } from 'graphql'
import type { Db } from '../../../helpers/db.ts'
import type { OrderRow } from './context.ts'

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
  const offset = args.after ? Number(Buffer.from(args.after, 'base64url').toString()) : 0
  const rows = await db.query<OrderRow>(
    `SELECT id, customer_id, ordered_at, total, internal_note FROM orders
     WHERE customer_id = $1 ORDER BY ordered_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [customerId, args.first + 1, offset])
  const edges = rows.slice(0, args.first).map((node, i) => ({ cursor: Buffer.from(String(offset + i + 1)).toString('base64url'), node }))
  return { edges, pageInfo: { hasNextPage: rows.length > args.first, endCursor: edges.at(-1)?.cursor ?? null } }
}
