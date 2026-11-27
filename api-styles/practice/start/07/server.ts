// 第 7 課的咖啡店 GraphQL 伺服器（不用改）：資料放在記憶體裡的 store，測試和範例都用它
// store.calls 記錄每個 resolver 被呼叫幾次：練習 4 用它判斷「有沒有命中回應快取」
import { readFileSync } from 'node:fs'
import { GraphQLError } from 'graphql'
import { createSchema, createYoga, type Plugin } from 'graphql-yoga'
import { CUSTOMERS, PRODUCTS, type Customer, type Product } from '../../helpers/coffee.ts'

export type OrderStatus = 'PREPARING' | 'READY' | 'PICKED_UP'
export type Order = { id: string, customerId: string, orderedAt: string, total: number, status: OrderStatus }
export type Store = {
  products: Product[]
  customers: Customer[]
  orders: Order[]
  calls: Record<string, number>   // 例如 calls['Query.menu']
  broken: Set<string>              // 這些顧客 id 的 Customer.name 會丟錯（練習 2 用來測錯誤處理）
}

export function createStore(orders: Order[] = []): Store {
  return {
    products: PRODUCTS.map(p => ({ ...p })),
    customers: CUSTOMERS.map(c => ({ ...c })),
    orders: orders.map(o => ({ ...o })),
    calls: {},
    broken: new Set(),
  }
}

type Context = { store: Store, viewerId: string | null }
const count = (store: Store, key: string) => { store.calls[key] = (store.calls[key] ?? 0) + 1 }
const cursorOf = (o: Order) => Buffer.from(o.id).toString('base64url')

export function buildYoga(store: Store, plugins: Plugin[] = []) {
  const schema = createSchema<Context>({
    typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'),
    resolvers: {
      Query: {
        menu: (_: unknown, __: unknown, ctx: Context) => {
          count(ctx.store, 'Query.menu')
          return ctx.store.products
        },
        me: (_: unknown, __: unknown, ctx: Context) => {
          count(ctx.store, 'Query.me')
          return ctx.store.customers.find(c => c.id === ctx.viewerId) ?? null
        },
        customer: (_: unknown, args: { id: string }, ctx: Context) => {
          count(ctx.store, 'Query.customer')
          return ctx.store.customers.find(c => c.id === args.id) ?? null
        },
      },
      Customer: {
        name: (c: Customer, _: unknown, ctx: Context) => {
          if (ctx.store.broken.has(c.id)) throw new GraphQLError(`讀不到顧客 ${c.id} 的資料`, { extensions: { code: 'UNAVAILABLE' } })
          return c.name
        },
        orders: (c: Customer, args: { first: number, after?: string | null }, ctx: Context) => {
          count(ctx.store, 'Customer.orders')
          if (!Number.isInteger(args.first) || args.first < 1 || args.first > 50) {
            throw new GraphQLError('first 要是 1 到 50 之間的整數', { extensions: { code: 'BAD_USER_INPUT' } })
          }
          const all = ctx.store.orders
            .filter(o => o.customerId === c.id)
            .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt) || Number(b.id) - Number(a.id))
          const start = args.after ? all.findIndex(o => cursorOf(o) === args.after) + 1 : 0
          const page = all.slice(start, start + args.first)
          return {
            edges: page.map(node => ({ cursor: cursorOf(node), node })),
            pageInfo: { hasNextPage: start + args.first < all.length, endCursor: page.length ? cursorOf(page.at(-1)!) : null },
          }
        },
      },
      Mutation: {
        placeOrder: (_: unknown, { input }: { input: { customerId: string, lines: { productId: string, quantity: number }[] } }, ctx: Context) => {
          if (!ctx.store.customers.some(c => c.id === input.customerId)) throw new GraphQLError('找不到這位顧客', { extensions: { code: 'NOT_FOUND' } })
          let total = 0
          for (const line of input.lines) {
            const p = ctx.store.products.find(x => x.id === line.productId)
            if (!p || !Number.isInteger(line.quantity) || line.quantity < 1) throw new GraphQLError('品項不正確', { extensions: { code: 'BAD_USER_INPUT' } })
            total += p.price * line.quantity
          }
          const id = String(Math.max(0, ...ctx.store.orders.map(o => Number(o.id))) + 1)
          const order: Order = { id, customerId: input.customerId, orderedAt: new Date().toISOString(), total, status: 'PREPARING' }
          ctx.store.orders.push(order)
          return order
        },
        updateOrderStatus: (_: unknown, args: { id: string, status: OrderStatus }, ctx: Context) => {
          const order = ctx.store.orders.find(o => o.id === args.id)
          if (order) order.status = args.status
          return order ?? null
        },
        updatePrice: (_: unknown, args: { productId: string, price: number }, ctx: Context) => {
          const p = ctx.store.products.find(x => x.id === args.productId)
          if (p) p.price = args.price
          return p ?? null
        },
      },
    },
  })
  return createYoga<{}, Context>({
    schema,
    plugins,
    logging: false,
    graphiql: false,
    context: ({ request }) => ({ store, viewerId: request.headers.get('x-customer-id') }),
  })
}
