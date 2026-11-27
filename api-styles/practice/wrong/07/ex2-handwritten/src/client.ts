// ✗ 手寫查詢字串與回應型別：schema 改了也不會報錯
import { cacheExchange, createClient, fetchExchange, gql, type Client, type CombinedError } from '@urql/core'

export type Result<T> = { data: T | undefined, error: CombinedError | undefined }
type History = { customer: { id: string, name: string, orders: { edges: { cursor: string, node: { id: string, orderedAt: string, total: number, status: string } }[] } } | null }
type Placed = { placeOrder: { id: string, orderedAt: string, total: number, status: string } }

const HISTORY = gql`
  query OrderHistory($customerId: ID!, $first: Int) {
    customer(id: $customerId) { id name orders(first: $first) { edges { cursor node { id orderedAt total status } } pageInfo { hasNextPage endCursor } } }
  }
`
const PLACE = gql`
  mutation PlaceOrder($input: PlaceOrderInput!) { placeOrder(input: $input) { id orderedAt total status } }
`

export function createHistoryClient(fetch: typeof globalThis.fetch): Client {
  return createClient({ url: 'http://localhost:4000/graphql', fetch, exchanges: [cacheExchange, fetchExchange], requestPolicy: 'cache-first' })
}

export async function loadHistory(client: Client, customerId: string, first: number): Promise<Result<History>> {
  const { data, error } = await client.query<History>(HISTORY, { customerId, first }, { additionalTypenames: ['Order'] }).toPromise()
  return { data, error }
}

export async function placeOrder(client: Client, input: unknown): Promise<Result<Placed>> {
  const { data, error } = await client.mutation<Placed>(PLACE, { input }).toPromise()
  return { data, error }
}
