// 練習 1：每條拿得到訂單、email、備註的路徑都要經過 visibility.ts 的函式
import type { YogaInitialContext } from 'graphql-yoga'
import type { CustomerRow, ItemRow, OrderRow, ProductRow, Store, Viewer } from './store.ts'
import { forbidden } from './visibility.ts'

export type Context = YogaInitialContext & { store: Store, viewer: Viewer | null }
type Id = { id: string }

export const resolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: Context) =>
      ctx.viewer?.role === 'CUSTOMER' ? ctx.store.customer(ctx.viewer.id) : null,
    menu: (_: unknown, __: unknown, ctx: Context) => ctx.store.menu(),
    product: (_: unknown, args: Id, ctx: Context) => ctx.store.product(args.id),
    customer: (_: unknown, args: Id, ctx: Context) => ctx.store.customer(args.id),
    // 入口有檢查……但只想到顧客本人（店員、沒登入都沒考慮），而且其他路徑完全沒檢查
    order: (_: unknown, args: Id, ctx: Context) => {
      const order = ctx.store.order(args.id)
      if (order && order.customerId !== ctx.viewer?.id) throw forbidden()
      return order
    },
  },
  Product: {
    // ✗ 任何人查 product { orders { … } } 都拿到所有人的訂單
    orders: (product: ProductRow, _: unknown, ctx: Context) => ctx.store.ordersWithProduct(product.id),
  },
  Customer: {
    // ✗ customer(id: "別人") { orders { … } } 一樣拿得到
    orders: (customer: CustomerRow, _: unknown, ctx: Context) => ctx.store.ordersOfCustomer(customer.id),
    // email 沒寫 resolver：預設 resolver 直接回傳 customer.email
  },
  Order: {
    // internalNote 沒寫 resolver：預設 resolver 直接回傳 order.internalNote
    customer: (order: OrderRow, _: unknown, ctx: Context) => ctx.store.customer(order.customerId),
    items: (order: OrderRow) => order.items,
  },
  OrderItem: {
    product: (item: ItemRow, _: unknown, ctx: Context) => ctx.store.product(item.productId),
  },
}
