// 練習 4：persisted operations（白名單）＋ CSRF 防護。
// - operations 是建置前端時產生的清單：{ sha256 雜湊: 查詢文字 }（examples/manifest.ts 示範怎麼產生）
// - 客戶端只送雜湊：{ "extensions": { "persistedQuery": { "version": 1, "sha256Hash": "…" } } }
// - 正式環境（dev 是 false）：只執行清單裡的操作；送查詢文字、送不在清單裡的雜湊都拒絕
// - 開發模式（dev 是 true）：也允許任意查詢文字（GraphiQL、寫新畫面時用）
// - 不論哪種模式都要有 CSRF 防護：@graphql-yoga/plugin-csrf-prevention
import { createSchema, createYoga } from 'graphql-yoga'
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations'
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention'
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
  // 用 Map 查：一般物件的 operations['toString']、operations['__proto__'] 會拿到原型上的東西
  const manifest = new Map(Object.entries(operations))
  return createYoga({
    schema,
    logging: false,
    plugins: [
      usePersistedOperations({
        getPersistedOperation: key => manifest.get(key) ?? null,
        // 由伺服器自己的設定決定，不看請求裡的任何東西
        allowArbitraryOperations: !dev,
      }),
      // GET 與「簡單請求」必須帶 x-graphql-yoga-csrf 標頭（瀏覽器跨站送不出自訂標頭而不先 preflight）
      useCSRFPrevention({ requestHeaders: ['x-graphql-yoga-csrf'] }),
    ],
  })
}
