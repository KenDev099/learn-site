// resolver：每個欄位怎麼算出值。沒寫的欄位走預設 resolver（回傳 parent[欄位名稱]）
import { GraphQLError } from 'graphql'
import type { Context } from './context.ts'
import type { OrderRow, OrderItemRow } from './db.ts'
import { placeOrder, type OrderLine } from './orders.ts'

export const resolvers = {
  Query: {
    order: (_parent: unknown, args: { id: string }, ctx: Context) => ctx.db.orderById(args.id),
    orders: (_parent: unknown, _args: unknown, ctx: Context) => ctx.db.listOrders(),
    me: (_parent: unknown, _args: unknown, ctx: Context) => ctx.viewer,
    myOrders: (_parent: unknown, _args: unknown, ctx: Context) =>
      ctx.viewer ? ctx.db.ordersByCustomer(ctx.viewer.id) : [],
  },

  Order: {
    orderedAt: (order: OrderRow) => order.ordered_at,
    customer: (order: OrderRow, _args: unknown, ctx: Context) => ctx.db.customerById(order.customer_id),
    items: (order: OrderRow, _args: unknown, ctx: Context) => ctx.db.itemsByOrder(order.id),
    // 用下單當下的 unit_price，不是商品現在的價格
    total: async (order: OrderRow, _args: unknown, ctx: Context) =>
      (await ctx.db.itemsByOrder(order.id)).reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
  },
  OrderItem: {
    product: (item: OrderItemRow, _args: unknown, ctx: Context) => ctx.db.productById(item.product_id),
    // ✗ 用商品現在的價格
    unitPrice: async (item: OrderItemRow, _args: unknown, ctx: Context) => (await ctx.db.productById(item.product_id))!.price,
  },

  Mutation: {
    // resolver 只做轉接：確認有登入、把參數交給服務層、把結果交回去
    placeOrder: (_parent: unknown, args: { input: { items: OrderLine[] } }, ctx: Context) => {
      if (!ctx.viewer) throw new GraphQLError('請先登入再下單', { extensions: { code: 'UNAUTHENTICATED' } })
      return placeOrder(ctx.db, ctx.viewer.id, args.input.items)
    },
  },
}
