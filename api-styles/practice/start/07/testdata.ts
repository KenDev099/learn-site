// 測試用的資料與工具（不用改）：每次執行用不同的種子產生訂單、價格，寫死答案不會過
import { CUSTOMERS, mulberry32, shuffle } from '../../helpers/coffee.ts'
import { buildYoga, createStore, type Order, type OrderStatus } from './server.ts'

const STATUSES: OrderStatus[] = ['PREPARING', 'READY', 'PICKED_UP']

export function setup() {
  const random = mulberry32(Date.now())
  const ids = shuffle(CUSTOMERS.map(c => c.id), random)
  const [empty, ...withOrders] = ids                     // empty：一張訂單都沒有的顧客
  const orders: Order[] = []
  for (const customerId of withOrders) {
    for (let i = 0, n = 2 + Math.floor(random() * 5); i < n; i++) {
      orders.push({
        id: String(orders.length + 1),
        customerId,
        orderedAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(random() * 28), Math.floor(random() * 24), Math.floor(random() * 60))).toISOString(),
        total: 70 + 10 * Math.floor(random() * 40),
        status: STATUSES[Math.floor(random() * 3)],
      })
    }
  }
  const store = createStore(orders)
  for (const p of store.products) p.price += 5 * Math.floor(random() * 6)   // 價格每次不同
  return { store, yoga: buildYoga(store), random, empty, withOrders }
}

export type Sent = { operationName?: string, query: string, variables: Record<string, any> }

// 假的 fetch：把請求轉給 yoga.fetch（不開 port），並記下每一個請求的內容
// urql 6 的查詢預設用 GET（網址不超過 2048 字元時），所以 GET 的網址參數和 POST 的 body 都要解析
export function recordingFetch(yoga: { fetch(url: string, init?: RequestInit): Response | Promise<Response> }) {
  const sent: Sent[] = []
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    if (init.body) sent.push(JSON.parse(String(init.body)))
    else sent.push({
      operationName: url.searchParams.get('operationName') ?? undefined,
      query: url.searchParams.get('query') ?? '',
      variables: JSON.parse(url.searchParams.get('variables') ?? '{}'),
    })
    return yoga.fetch(`http://yoga/graphql${url.search}`, init)
  }
  return { fetch: fetch as typeof globalThis.fetch, sent }
}

// 練習 2、3 要用練習 1 產生的 src/gql/graphql.ts：還沒產生時給一個看得懂的錯誤
export async function generated() {
  try {
    // 用變數當路徑：練習 1 還沒做時檔案不存在，型別檢查也不會因此報錯
    const path = new URL('./src/gql/graphql.ts', import.meta.url).href
    return await import(path)
  } catch (e) {
    throw new Error(`讀不到 src/gql/graphql.ts（${(e as Error).message.split('\n')[0]}）：先完成練習 1，讓 codegen 產生 PlaceOrderDocument、OrderHistoryDocument`)
  }
}
