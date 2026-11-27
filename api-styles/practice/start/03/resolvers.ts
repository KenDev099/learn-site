// resolver：每個欄位怎麼算出值。沒寫的欄位走預設 resolver（回傳 parent[欄位名稱]）
import type { Context } from './context.ts'
import { currentCustomerId } from './context.ts'

export const resolvers = {
  Query: {
    order: (_parent: unknown, args: { id: string }, ctx: Context) => ctx.db.orderById(args.id),
    orders: (_parent: unknown, _args: unknown, ctx: Context) => ctx.db.listOrders(),
    // 練習 2：這兩個 resolver 讀的是模組變數，改成讀 context
    me: (_parent: unknown, _args: unknown, ctx: Context) =>
      currentCustomerId ? ctx.db.customerById(currentCustomerId) : null,
    myOrders: async (_parent: unknown, _args: unknown, ctx: Context) =>
      (await ctx.db.listOrders()).filter(o => o.customer_id === currentCustomerId),
  },

  // 練習 1：parent 是資料庫的一列（OrderRow、OrderItemRow），欄位名稱是 snake_case
  Order: {
    // TODO：orderedAt、customer、items、total
  },
  OrderItem: {
    // TODO：product、unitPrice
  },
}

