// examples/graphcache.ts：正規化快取把每個物件拆開存（先完成練習 1，在 work/07 執行）
import { createClient, fetchExchange } from '@urql/core'
import { cacheExchange } from '@urql/exchange-graphcache'
import { buildYoga, createStore } from '../server.ts'

const gen = await import(new URL('../src/gql/graphql.ts', import.meta.url).href)
const store = createStore([
  { id: '41', customerId: '1', orderedAt: '2026-10-30T08:00:00.000Z', total: 110, status: 'PREPARING' },
  { id: '42', customerId: '1', orderedAt: '2026-10-31T08:00:00.000Z', total: 190, status: 'PREPARING' },
])
const yoga = buildYoga(store)
let requests = 0
const fetch = ((url: string, init: RequestInit) => { requests++; return yoga.fetch(url, init) }) as typeof globalThis.fetch

const client = createClient({
  url: 'http://localhost:4000/graphql',
  fetch,
  exchanges: [cacheExchange({}), fetchExchange],
})
const load = () => client.query(gen.OrderHistoryDocument, { customerId: '1', first: 5 }).toPromise()
const statuses = (r: any) => r.data.customer.orders.edges.map((e: any) => `Order:${e.node.id}=${e.node.status}`).join(' ')

console.log('第一次查：', statuses(await load()), `（${requests} 個請求）`)
await client.mutation(gen.UpdateOrderStatusDocument, { id: '42', status: 'READY' }).toPromise()
console.log('改狀態後：', statuses(await load()), `（${requests} 個請求：mutation 那一個，歷史沒有重新查）`)
