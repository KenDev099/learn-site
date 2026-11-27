// 練習 2：用 @urql/core 的 document cache 載入訂單歷史、下單
import { cacheExchange, createClient, fetchExchange, type Client, type CombinedError } from '@urql/core'
import { OrderHistoryDocument, PlaceOrderDocument, type OrderHistoryQuery, type PlaceOrderInput, type PlaceOrderMutation } from './gql/graphql.ts'

export type Result<T> = { data: T | undefined, error: CombinedError | undefined }

// 整個 App 只建一個 client：快取存在 client 裡面
export function createHistoryClient(fetch: typeof globalThis.fetch): Client {
  return createClient({
    url: 'http://localhost:4000/graphql',
    fetch,
    exchanges: [cacheExchange, fetchExchange],
    requestPolicy: 'cache-first',
  })
}

export async function loadHistory(client: Client, customerId: string, first: number): Promise<Result<OrderHistoryQuery>> {
  // additionalTypenames：列表是空的時候結果裡沒有 Order，要自己說「這份查詢跟 Order 有關」，
  // 任何回傳 Order 的 mutation 才會讓它失效
  const { data, error } = await client
    .query(OrderHistoryDocument, { customerId, first }, { additionalTypenames: ['Order'] })
    .toPromise()
  if (error) throw error
  return { data, error }
}

export async function placeOrder(client: Client, input: PlaceOrderInput): Promise<Result<PlaceOrderMutation>> {
  const { data, error } = await client.mutation(PlaceOrderDocument, { input }).toPromise()
  return { data, error }
}
