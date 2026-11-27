// 練習 4：persisted operations（白名單）＋ CSRF 防護。
// - operations 是建置前端時產生的清單：{ sha256 雜湊: 查詢文字 }（examples/manifest.ts 示範怎麼產生）
// - 客戶端只送雜湊：{ "extensions": { "persistedQuery": { "version": 1, "sha256Hash": "…" } } }
// - 正式環境（dev 是 false）：只執行清單裡的操作；送查詢文字、送不在清單裡的雜湊都拒絕
// - 開發模式（dev 是 true）：也允許任意查詢文字（GraphiQL、寫新畫面時用）
// - 不論哪種模式都要有 CSRF 防護：@graphql-yoga/plugin-csrf-prevention
import { createSchema, createYoga } from 'graphql-yoga'
import { PRODUCTS } from '../../helpers/coffee.ts'

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Product { id: ID! name: String! price: Int! }
    type Query { menu: [Product!]! product(id: ID!): Product }
  `,
  resolvers: {
    Query: {
      menu: () => PRODUCTS,
      product: (_: unknown, args: { id: string }) => PRODUCTS.find(p => p.id === args.id) ?? null,
    },
  },
})

export function createApp({ operations, dev = false }: { operations: Record<string, string>, dev?: boolean }) {
  return createYoga({
    schema,
    logging: false,
    // ✗ 沒有任何防護：誰都可以送任何查詢
    plugins: [],
  })
}
