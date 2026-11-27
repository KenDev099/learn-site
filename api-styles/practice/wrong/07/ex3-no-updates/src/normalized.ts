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
      }),
      fetchExchange,
    ],
  })
}
