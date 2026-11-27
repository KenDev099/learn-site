// ✗ 用 @urql/core 的 document cache：任何回傳 Order 的 mutation 都讓整份查詢失效、重新查
import { cacheExchange, createClient, fetchExchange, type Client } from '@urql/core'

export function createNormalizedClient(fetch: typeof globalThis.fetch): Client {
  return createClient({
    url: 'http://localhost:4000/graphql',
    fetch,
    requestPolicy: 'cache-first',
    exchanges: [cacheExchange, fetchExchange],
  })
}
