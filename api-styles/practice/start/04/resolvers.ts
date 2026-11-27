// 練習 2：把下面每個「用 id 查一筆／查一張訂單的品項」的 resolver 改成用 ctx.loaders
// 練習 3：updatePrice 改完價格之後，同一個請求後面的讀取要看到新價格
import type { Context } from './context.ts'
import type { ItemRow, OrderRow, ProductRow } from './rows.ts'

const first = async <T>(rows: Promise<T[]>) => (await rows)[0] ?? null

export const resolvers = {
  Query: {
    orders: (_: unknown, args: { last: number }, ctx: Context) =>
      ctx.db.query<OrderRow>('SELECT id, customer_id, ordered_at, total FROM orders ORDER BY ordered_at DESC, id DESC LIMIT $1', [args.last]),
    product: (_: unknown, args: { id: string }, ctx: Context) =>
      first(ctx.db.query<ProductRow>('SELECT id, name, price, category FROM products WHERE id = $1', [Number(args.id)])),
  },
  Order: {
    orderedAt: (order: OrderRow) => order.ordered_at.toISOString(),
    customer: (order: OrderRow, _: unknown, ctx: Context) =>
      first(ctx.db.query('SELECT id, name FROM customers WHERE id = $1', [order.customer_id])),
    items: (order: OrderRow, _: unknown, ctx: Context) =>
      ctx.db.query<ItemRow>('SELECT order_id, product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id', [order.id]),
  },
  OrderItem: {
    unitPrice: (item: ItemRow) => item.unit_price,
    product: (item: ItemRow, _: unknown, ctx: Context) =>
      first(ctx.db.query<ProductRow>('SELECT id, name, price, category FROM products WHERE id = $1', [item.product_id])),
  },
  Mutation: {
    updatePrice: async (_: unknown, args: { productId: string, price: number }, ctx: Context) => {
      const id = Number(args.productId)
      const before = await ctx.loaders.productById.load(id)   // 先確認商品存在
      if (!before) return null
      await ctx.db.query('UPDATE products SET price = $2 WHERE id = $1', [id, args.price])
      return ctx.loaders.productById.load(id)
    },
  },
}
