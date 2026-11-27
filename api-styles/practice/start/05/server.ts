// 練習 2 的伺服器（不用改）：schema.graphql ＋ resolver，context 帶著資料庫
import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import type { Db } from '../../helpers/db.ts'
import { ordersConnection, type OrderRow } from './orders.ts'

type Context = { db: Db }

export function buildYoga(db: Db) {
  const schema = createSchema<Context>({
    typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'),
    resolvers: {
      Query: {
        customer: async (_: unknown, args: { id: string }, ctx: Context) =>
          (await ctx.db.query('SELECT id, name FROM customers WHERE id = $1', [args.id]))[0] ?? null,
      },
      Customer: {
        orders: (customer: { id: number }, args: { first?: number | null, after?: string | null }, ctx: Context) =>
          ordersConnection(ctx.db, String(customer.id), args),
      },
      Order: {
        orderedAt: (o: OrderRow) => o.ordered_at.toISOString(),
      },
    },
  })
  return createYoga({ schema, context: { db }, logging: false })
}
