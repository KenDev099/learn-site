// 沒有優化的 resolver（不用改）：每個欄位各查各的，一份查詢會發出 1 + N + N + 品項數 句 SQL
// 練習 1 量測的就是它；練習 2 的結果要跟它一模一樣
import type { Db } from '../../helpers/db.ts'
import type { CustomerRow, ItemRow, OrderRow, ProductRow } from './rows.ts'

type Ctx = { db: Db }
const first = async <T>(rows: Promise<T[]>) => (await rows)[0] ?? null

export const naiveResolvers = {
  Query: {
    orders: (_: unknown, args: { last: number }, ctx: Ctx) =>
      ctx.db.query<OrderRow>('SELECT id, customer_id, ordered_at, total FROM orders ORDER BY ordered_at DESC, id DESC LIMIT $1', [args.last]),
    product: (_: unknown, args: { id: string }, ctx: Ctx) =>
      first(ctx.db.query<ProductRow>('SELECT id, name, price, category FROM products WHERE id = $1', [Number(args.id)])),
  },
  Order: {
    orderedAt: (order: OrderRow) => order.ordered_at.toISOString(),
    customer: (order: OrderRow, _: unknown, ctx: Ctx) =>
      first(ctx.db.query<CustomerRow>('SELECT id, name FROM customers WHERE id = $1', [order.customer_id])),
    items: (order: OrderRow, _: unknown, ctx: Ctx) =>
      ctx.db.query<ItemRow>('SELECT order_id, product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id', [order.id]),
  },
  OrderItem: {
    unitPrice: (item: ItemRow) => item.unit_price,
    product: (item: ItemRow, _: unknown, ctx: Ctx) =>
      first(ctx.db.query<ProductRow>('SELECT id, name, price, category FROM products WHERE id = $1', [item.product_id])),
  },
  Mutation: {
    updatePrice: (_: unknown, args: { productId: string, price: number }, ctx: Ctx) =>
      first(ctx.db.query<ProductRow>('UPDATE products SET price = $2 WHERE id = $1 RETURNING id, name, price, category', [Number(args.productId), args.price])),
  },
}
