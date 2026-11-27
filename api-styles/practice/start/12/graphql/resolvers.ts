// 練習 1：resolver。目前的版本「功能都有」，但上線會出事：
// ✗ 每個關聯欄位各查一次資料庫（N+1）：Order.customer、Order.items、OrderItem.product
// ✗ 沒有授權：order(id)、Customer.orders、Product.orders 誰都拿得到；email、internalNote 誰都看得到
// 要做到：
// - 關聯改用 ctx.loaders（loaders.ts）
// - 每條拿得到訂單的路徑都經過 auth.ts：order 用 requireOrder；Customer.orders 看 canSeeOrdersOf，看不到回 EMPTY；
//   Product.orders 顧客只拿得到自己的、店員全部、沒登入是 []（條件寫進 SQL）
// - Customer.email、Order.internalNote 用 staffOnly
// menuWithStock、MenuItem、Mutation 已經寫好，不用改（庫存與下單是練習 3）
import { GraphQLError } from 'graphql'
import type { Context, ItemRow, OrderRow, ProductRow } from './context.ts'
import { checkFirst, ordersConnection } from './orders.ts'
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
    me: async (_: unknown, __: unknown, ctx: Context) => {
      if (ctx.viewer?.role !== 'CUSTOMER') return null
      return (await ctx.db.query('SELECT id, name, email FROM customers WHERE id = $1', [Number(ctx.viewer.id)]))[0] ?? null
    },
    customer: async (_: unknown, args: Id, ctx: Context) =>
      (await ctx.db.query('SELECT id, name, email FROM customers WHERE id = $1', [Number(args.id)]))[0] ?? null,
    order: async (_: unknown, args: Id, ctx: Context) =>
      (await ctx.db.query('SELECT id, customer_id, ordered_at, total, internal_note FROM orders WHERE id = $1', [Number(args.id)]))[0] ?? null,
  },
  Mutation: {
    placeOrder: (_: unknown, args: { input: PlaceOrderInput }, ctx: Context) => placeOrder(ctx, args.input),
  },
  MenuItem: {
    // 庫存服務查不到（stock 是 null）時：這個欄位是 null，errors 帶 INVENTORY_UNAVAILABLE，菜單其他欄位照常回傳
    available: (item: MenuItem) => {
      if (!item.stock) throw new GraphQLError('庫存資訊暫時無法取得', { extensions: { code: 'INVENTORY_UNAVAILABLE' } })
      return item.stock.get(String(item.product.id)) ?? null
    },
  },
  Product: {
    orders: (product: ProductRow, args: { first: number }, ctx: Context) => {
      checkFirst(args.first)
      return ctx.db.query<OrderRow>(
        `SELECT o.id, o.customer_id, o.ordered_at, o.total, o.internal_note FROM orders o
         WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.product_id = $1)
         ORDER BY o.ordered_at DESC, o.id DESC LIMIT $2`,
        [product.id, args.first])
    },
  },
  Customer: {
    orders: (c: { id: number }, args: { first: number, after?: string | null }, ctx: Context) => ordersConnection(ctx.db, c.id, args),
  },
  Order: {
    orderedAt: (o: OrderRow) => o.ordered_at.toISOString(),
    internalNote: (o: OrderRow) => o.internal_note,
    customer: async (o: OrderRow, _: unknown, ctx: Context) =>
      (await ctx.db.query('SELECT id, name, email FROM customers WHERE id = $1', [o.customer_id]))[0],
    items: (o: OrderRow, _: unknown, ctx: Context) =>
      ctx.db.query<ItemRow>('SELECT order_id, product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id', [o.id]),
  },
  OrderItem: {
    product: async (i: ItemRow, _: unknown, ctx: Context) =>
      (await ctx.db.query('SELECT id, name, price, category FROM products WHERE id = $1', [i.product_id]))[0],
    unitPrice: (i: ItemRow) => i.unit_price,
  },
}
