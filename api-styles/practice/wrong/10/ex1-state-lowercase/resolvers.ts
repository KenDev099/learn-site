// 練習 1：schema-v1.graphql 與 evolve.graphql 共用的 resolver。
// 資料列的形狀不能改：資料庫的欄位還是 price，status 存的還是小寫的 'preparing' 這類字串
export type ProductRow = { id: string, name: string, price: number }
export type OrderRow = {
  id: string
  total: number
  status: 'preparing' | 'ready' | 'picked_up'
  items: { productId: string, quantity: number }[]
}
export type Context = { products: ProductRow[], orders: OrderRow[] }

export const resolvers = {
  Query: {
    menu: (_: unknown, __: unknown, ctx: Context) => ctx.products,
    order: (_: unknown, args: { id: string }, ctx: Context) => ctx.orders.find(o => o.id === args.id) ?? null,
  },
  // 新欄位從同一份資料算出來；舊欄位 price、status 沒寫 resolver，預設 resolver 照舊讀同名屬性
  Product: {
    priceTwd: (p: ProductRow) => p.price,
  },
  Order: {
    state: (o: OrderRow) => o.status,
  },
  OrderItem: {
    product: (item: OrderRow['items'][number], _: unknown, ctx: Context) => ctx.products.find(p => p.id === item.productId),
  },
}
