// 印出 resolver 的呼叫順序：node examples/trace.ts
import { graphql, responsePathAsArray, type GraphQLResolveInfo } from 'graphql'
import { createSchema } from 'graphql-yoga'
import { createDb, type OrderRow, type OrderItemRow } from '../db.ts'

type Ctx = { db: ReturnType<typeof createDb> }
const where = (info: GraphQLResolveInfo) => `${info.parentType.name}.${info.fieldName}  path=${JSON.stringify(responsePathAsArray(info.path))}`

const schema = createSchema<Ctx>({
  typeDefs: /* GraphQL */ `
    type Product { id: ID!  name: String! }
    type OrderItem { quantity: Int!  product: Product! }
    type Order { id: ID!  items: [OrderItem!]! }
    type Query { order(id: ID!): Order }
  `,
  resolvers: {
    Query: {
      order: (_parent: unknown, args: { id: string }, ctx: Ctx, info: GraphQLResolveInfo) => {
        console.log(where(info), ' args =', JSON.stringify(args))
        return ctx.db.orderById(args.id)
      },
    },
    Order: {
      items: (order: OrderRow, _args: unknown, ctx: Ctx, info: GraphQLResolveInfo) => {
        console.log(where(info), ' parent =', JSON.stringify(order))
        return ctx.db.itemsByOrder(order.id)
      },
    },
    OrderItem: {
      product: (item: OrderItemRow, _args: unknown, ctx: Ctx, info: GraphQLResolveInfo) => {
        console.log(where(info), ' parent.product_id =', item.product_id)
        return ctx.db.productById(item.product_id)
      },
    },
    // Order.id、OrderItem.quantity、Product.name 沒寫：預設 resolver 回傳 parent.id、parent.quantity、parent.name
  },
})

const result = await graphql({
  schema,
  source: '{ order(id: "1") { id items { quantity product { name } } } }',
  contextValue: { db: createDb() },
})
console.log(JSON.stringify(result, null, 2))
