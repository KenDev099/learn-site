// examples/document-cache.ts：document cache 在「空列表 + 下單」時的問題（先完成練習 1，在 work/07 執行）
import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import { buildYoga, createStore } from '../server.ts'

const gen = await import(new URL('../src/gql/graphql.ts', import.meta.url).href)
const store = createStore()
const yoga = buildYoga(store)
let requests = 0
const fetch = ((url: string, init: RequestInit) => { requests++; return yoga.fetch(url, init) }) as typeof globalThis.fetch

for (const [i, context] of [{}, { additionalTypenames: ['Order'] }].entries()) {
  const client = createClient({ url: 'http://localhost:4000/graphql', fetch, exchanges: [cacheExchange, fetchExchange] })
  const customerId = String(i + 1)   // 兩位都還沒有訂單的顧客
  const load = () => client.query(gen.OrderHistoryDocument, { customerId, first: 5 }, context).toPromise()
  requests = 0
  const before = (await load()).data.customer.orders.edges.length
  await client.mutation(gen.PlaceOrderDocument, { input: { customerId, lines: [{ productId: '2', quantity: 1 }] } }).toPromise()
  const after = (await load()).data.customer.orders.edges.length
  console.log(`context = ${JSON.stringify(context)}：下單前 ${before} 張、下單後 ${after} 張，共 ${requests} 個請求`)
}
