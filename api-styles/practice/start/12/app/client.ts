// App 端呼叫 GraphQL 的程式（不用改）：正式環境只送 persisted operation 的雜湊，不送查詢文字
// 雜湊來自 codegen 產生的 Document（__meta__.hash 是 "sha256:<hex>"）
import { OrderHistoryDocument, type OrderHistoryQuery } from './gql/graphql.ts'

export const ORDER_HISTORY_HASH = String((OrderHistoryDocument as { __meta__?: { hash?: string } }).__meta__?.hash ?? '').replace(/^sha256:/, '')

export async function fetchOrderHistory(baseUrl: string, token: string, variables: { first: number, after?: string }): Promise<OrderHistoryQuery> {
  const res = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ variables, extensions: { persistedQuery: { version: 1, sha256Hash: ORDER_HISTORY_HASH } } }),
  })
  const body = await res.json() as { data?: OrderHistoryQuery, errors?: { message: string }[] }
  if (!res.ok || body.errors?.length || !body.data) throw new Error(`OrderHistory 失敗（HTTP ${res.status}）：${body.errors?.map(e => e.message).join('；')}`)
  return body.data
}
