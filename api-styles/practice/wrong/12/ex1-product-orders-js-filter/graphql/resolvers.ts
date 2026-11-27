// 練習 1：resolver。關聯一律走 ctx.loaders（每個請求一份）；每條拿得到訂單、email、備註的路徑都經過 auth.ts
import { GraphQLError } from 'graphql'
import type { Context, ItemRow, OrderRow, ProductRow } from './context.ts'
import { canSeeOrdersOf, isStaff, requireOrder, staffOnly } from './auth.ts'
import { EMPTY, checkFirst, ordersConnection } from './orders.ts'
import { stockFor } from './inventory.ts'
import { placeOrder, type PlaceOrderInput } from './place-order.ts'

type Id = { id: string }
type MenuItem = { product: ProductRow, stock: Map<string, number> | null }

export const resolvers = {
  Query: {
    menuWithStock: async (_: unknown, __: unknown, ctx: Context): Promise<MenuItem[]> => {
      const products = await ctx.db.query<ProductRow>('SELECT id, name, price, category FROM products ORDER BY id')
      const stock = await stockFor(ctx, products.map(p => String(p.id)))
      return products.map(product => ({ product, stock }))
    },
    me: (_: unknown, __: unknown, ctx: Context) =>
      ctx.viewer?.role === 'CUSTOMER' ? ctx.loaders.customerById.load(Number(ctx.viewer.id)) : null,
    customer: (_: unknown, args: Id, ctx: Context) => ctx.loaders.customerById.load(Number(args.id)),
    order: async (_: unknown, args: Id, ctx: Context) => {
      if (!ctx.viewer) return requireOrder(null, null)
      const [order] = await ctx.db.query<OrderRow>('SELECT id, customer_id, ordered_at, total, internal_note FROM orders WHERE id = $1', [Number(args.id)])
      return requireOrder(ctx.viewer, order ?? null)
    },
  },
  Mutation: {
    placeOrder: (_: unknown, args: { input: PlaceOrderInput }, ctx: Context) => placeOrder(ctx, args.input),
  },
  MenuItem: {
    available: (item: MenuItem) => {
      if (!item.stock) throw new GraphQLError('庫存資訊暫時無法取得', { extensions: { code: 'INVENTORY_UNAVAILABLE' } })
      return item.stock.get(String(item.product.id)) ?? null
    },
  },
  Product: {
    // 這條路徑也拿得到訂單：顧客只看自己的，沒登入什麼都沒有。條件寫在 SQL 裡，不先查全部再濾
    orders: async (product: ProductRow, args: { first: number }, ctx: Context) => {
      checkFirst(args.first)
      const viewer = ctx.viewer
      if (!viewer) return []
      // ✗ 先取所有人的前 first 張，再用 JavaScript 濾掉別人的：沒有外洩，但常常不到 first 張
      const rows = await ctx.db.query<OrderRow>(
        `SELECT o.id, o.customer_id, o.ordered_at, o.total, o.internal_note FROM orders o
         WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.product_id = $1)
         ORDER BY o.ordered_at DESC, o.id DESC LIMIT $2`,
        [product.id, args.first])
      return rows.filter(o => isStaff(viewer) || String(o.customer_id) === viewer.id)
    },
  },
  Customer: {
    email: (c: { email: string | null }, _: unknown, ctx: Context) => staffOnly(ctx.viewer, c.email),
    orders: (c: { id: number }, args: { first: number, after?: string | null }, ctx: Context) =>
      canSeeOrdersOf(ctx.viewer, c.id) ? ordersConnection(ctx.db, c.id, args) : EMPTY,
  },
  Order: {
    orderedAt: (o: OrderRow) => o.ordered_at.toISOString(),
    internalNote: (o: OrderRow, _: unknown, ctx: Context) => staffOnly(ctx.viewer, o.internal_note),
    customer: (o: OrderRow, _: unknown, ctx: Context) => ctx.loaders.customerById.load(o.customer_id),
    items: (o: OrderRow, _: unknown, ctx: Context) => ctx.loaders.itemsByOrderId.load(o.id),
  },
  OrderItem: {
    product: (i: ItemRow, _: unknown, ctx: Context) => ctx.loaders.productById.load(i.product_id),
    unitPrice: (i: ItemRow) => i.unit_price,
  },
}
