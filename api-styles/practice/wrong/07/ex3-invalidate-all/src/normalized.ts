// 練習 3：改用 graphcache（正規化快取）
import { createClient, fetchExchange, type Client } from '@urql/core'
import { cacheExchange } from '@urql/exchange-graphcache'

export function createNormalizedClient(fetch: typeof globalThis.fetch): Client {
  return createClient({
    url: 'http://localhost:4000/graphql',
    fetch,
    requestPolicy: 'cache-first',
    exchanges: [
      cacheExchange({
        updates: {
          Mutation: {
            // ✗ 整個 Query 失效：所有顧客、所有查詢都重查，正規化快取等於沒用
            placeOrder(_result, _args, cache) {
              cache.invalidate('Query')
            },
          },
        },
      }),
      fetchExchange,
    ],
  })
}
