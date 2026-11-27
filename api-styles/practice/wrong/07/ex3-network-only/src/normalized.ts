// 練習 3：改用 graphcache（正規化快取）
import { createClient, fetchExchange, type Client } from '@urql/core'
import { cacheExchange } from '@urql/exchange-graphcache'
import type { PlaceOrderMutationVariables } from './gql/graphql.ts'

export function createNormalizedClient(fetch: typeof globalThis.fetch): Client {
  return createClient({
    url: 'http://localhost:4000/graphql',
    fetch,
    requestPolicy: 'network-only',
    exchanges: [
      cacheExchange({
        updates: {
          Mutation: {
            // 新訂單不在任何列表裡：讓這位顧客的 orders 欄位（每一組 first／after）失效，下次讀取會重新查
            placeOrder(_result, args, cache) {
              const customer = { __typename: 'Customer', id: (args as PlaceOrderMutationVariables).input.customerId }
              for (const field of cache.inspectFields(customer)) {
                if (field.fieldName === 'orders') cache.invalidate(customer, field.fieldName, field.arguments)
              }
            },
          },
        },
      }),
      fetchExchange,
    ],
  })
}
