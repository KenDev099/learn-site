// 練習 2：用 @urql/core 的 document cache 載入訂單歷史、下單
// 先完成練習 1，再從 './gql/graphql.ts' import 產生的 OrderHistoryDocument、PlaceOrderDocument 和它們的型別
import type { Client, CombinedError } from '@urql/core'

export type Result<T> = { data: T | undefined, error: CombinedError | undefined }

// 整個 App 只建一個 client；url 用 'http://localhost:4000/graphql'，fetch 用參數傳進來的
export function createHistoryClient(fetch: typeof globalThis.fetch): Client {
  throw new Error('還沒實作 createHistoryClient')
}

// 回傳 { data, error }，不要丟例外
export async function loadHistory(client: Client, customerId: string, first: number): Promise<Result<unknown>> {
  throw new Error('還沒實作 loadHistory')
}

export async function placeOrder(client: Client, input: unknown): Promise<Result<unknown>> {
  throw new Error('還沒實作 placeOrder')
}
