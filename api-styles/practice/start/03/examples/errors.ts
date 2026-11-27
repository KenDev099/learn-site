// resolver 丟錯時，Yoga 回什麼：node examples/errors.ts
import { createSchema, createYoga } from 'graphql-yoga'
import { GraphQLError } from 'graphql'

const yoga = createYoga({
  logging: false,
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Product { name: String! }
      type OrderItem { quantity: Int!  product: Product }
      type Order { id: ID!  items: [OrderItem!]! }
      type Query { order: Order  promo: String  banner: String }
    `,
    resolvers: {
      Query: {
        order: () => ({ id: '1', items: [{ quantity: 1, productId: '2' }, { quantity: 2, productId: '404' }] }),
        promo: () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432') },          // 非預期的錯誤
        banner: () => { throw new GraphQLError('今天的活動還沒開始') },                    // 刻意給客戶端看的錯誤
      },
      OrderItem: {
        product: (item: { productId: string }) => {
          if (item.productId === '404') throw new Error(`找不到商品 ${item.productId}`)
          return { name: '拿鐵' }
        },
      },
    },
  }),
})

const res = await yoga.fetch('http://yoga/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: '{ order { id items { quantity product { name } } } promo banner }' }),
})
console.log(res.status, JSON.stringify(await res.json(), null, 2))
