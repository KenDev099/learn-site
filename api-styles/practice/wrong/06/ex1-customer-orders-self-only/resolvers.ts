// 練習 1：每條拿得到訂單、email、備註的路徑都要經過 visibility.ts 的函式
import type { YogaInitialContext } from 'graphql-yoga'
import type { CustomerRow, ItemRow, OrderRow, ProductRow, Store, Viewer } from './store.ts'
import { requireOrder, staffOnly, visibleOrders } from './visibility.ts'

export type Context = YogaInitialContext & { store: Store, viewer: Viewer | null }
type Id = { id: string }

export const resolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: Context) =>
      ctx.viewer?.role === 'CUSTOMER' ? ctx.store.customer(ctx.viewer.id) : null,
    menu: (_: unknown, __: unknown, ctx: Context) => ctx.store.menu(),
    product: (_: unknown, args: Id, ctx: Context) => ctx.store.product(args.id),
    customer: (_: unknown, args: Id, ctx: Context) => ctx.store.customer(args.id),
    order: (_: unknown, args: Id, ctx: Context) => requireOrder(ctx.viewer, ctx.store.order(args.id)),
  },
  Product: {
    orders: (product: ProductRow, _: unknown, ctx: Context) => visibleOrders(ctx.viewer, ctx.store.ordersWithProduct(product.id)),
  },
  Customer: {
    orders: (customer: CustomerRow, _: unknown, ctx: Context) => ctx.viewer?.id === customer.id ? ctx.store.ordersOfCustomer(customer.id) : [],
    // 欄位層級：不論 Customer 物件是從哪條路徑來的（customer、me、Order.customer），email 都經過這裡
    email: (customer: CustomerRow, _: unknown, ctx: Context) => staffOnly(ctx.viewer, customer.email),
  },
  Order: {
    internalNote: (order: OrderRow, _: unknown, ctx: Context) => staffOnly(ctx.viewer, order.internalNote),
    customer: (order: OrderRow, _: unknown, ctx: Context) => ctx.store.customer(order.customerId),
    items: (order: OrderRow) => order.items,
  },
  OrderItem: {
    product: (item: ItemRow, _: unknown, ctx: Context) => ctx.store.product(item.productId),
  },
}
