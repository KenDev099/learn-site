import test from 'node:test'
import assert from 'node:assert/strict'
import { quietYogaLogs } from '../../helpers/graphql.ts'
import { generated, recordingFetch, setup } from './testdata.ts'

quietYogaLogs()
const opts = { timeout: 10_000 }

async function load(): Promise<any> {
  const gen = await generated()
  try {
    return { gen, ...(await import('./src/normalized.ts')) }
  } catch (e) {
    throw new Error(`src/normalized.ts 沒辦法載入：${(e as Error).message.split('\n')[0]}`)
  }
}
const ids = (data: any) => (data?.customer?.orders?.edges ?? []).map((e: any) => e.node.id)

test('改訂單狀態後，歷史直接從正規化快取顯示新狀態，不重新查詢', opts, async () => {
  const { gen, createNormalizedClient } = await load()
  const { store, yoga, withOrders, random } = setup()
  const { fetch, sent } = recordingFetch(yoga)
  const client = createNormalizedClient(fetch)
  const customerId = withOrders[0]
  const history = () => client.query(gen.OrderHistoryDocument, { customerId, first: 10 }).toPromise()

  const first = await history()
  assert.equal(first.error, undefined, `查詢不應該有錯誤：${first.error?.message}`)
  const edges = first.data!.customer!.orders.edges
  assert.ok(edges.length > 0, '這位顧客應該有訂單')
  const again = await history()
  assert.equal(sent.length, 1, `沒有任何變更時，再查一次要直接用快取（送出了 ${sent.length} 個請求）：requestPolicy 用 cache-first`)
  assert.deepEqual(ids(again.data), ids(first.data), '快取的結果要跟第一次一樣')

  const target = edges[Math.floor(random() * edges.length)].node
  const status = (['PREPARING', 'READY', 'PICKED_UP'] as const).find(s => s !== target.status)!
  const changed = await client.mutation(gen.UpdateOrderStatusDocument, { id: target.id, status }).toPromise()
  assert.equal(changed.error, undefined, `改狀態不應該有錯誤：${changed.error?.message}`)
  assert.equal(store.orders.find(o => o.id === target.id)!.status, status, '伺服器上的狀態應該已經改了')

  const after = await history()
  assert.equal(sent.length, 2, `改狀態後又送出了查詢（共 ${sent.length} 個請求，應該是 2 個）：document cache 看到 mutation 回傳 Order 就讓整份查詢失效、重新查；正規化快取（@urql/exchange-graphcache 的 cacheExchange）會直接把 Order:${target.id} 的 status 換掉`)
  const node = after.data!.customer!.orders.edges.find((e: any) => e.node.id === target.id)?.node
  assert.equal(node?.status, status, `歷史裡 Order:${target.id} 的 status 應該已經是 ${status}`)
})

test('下單後，這位顧客的歷史（不同 first 的每一份）都重新查詢並出現新訂單，別位顧客的歷史不受影響', opts, async () => {
  const { gen, createNormalizedClient } = await load()
  const { store, yoga, empty, withOrders, random } = setup()
  const { fetch, sent } = recordingFetch(yoga)
  const client = createNormalizedClient(fetch)
  const small = 1 + Math.floor(random() * 3)
  const history = (first: number) => client.query(gen.OrderHistoryDocument, { customerId: empty, first }).toPromise()
  const otherHistory = () => client.query(gen.OrderHistoryDocument, { customerId: withOrders[0], first: 10 }).toPromise()
  assert.deepEqual(ids((await history(10)).data), [], '這位顧客一開始沒有訂單')
  assert.deepEqual(ids((await history(small)).data), [], '這位顧客一開始沒有訂單')
  const other = ids((await otherHistory()).data)
  assert.equal(sent.length, 3)

  const product = store.products[Math.floor(random() * store.products.length)]
  const placed = await client.mutation(gen.PlaceOrderDocument, { input: { customerId: empty, lines: [{ productId: product.id, quantity: 1 }] } }).toPromise()
  assert.equal(placed.error, undefined, `下單不應該有錯誤：${placed.error?.message}`)
  const newId = placed.data!.placeOrder.id

  const big = await history(10)
  assert.deepEqual(ids(big.data), [newId], `下單後 orders(first: 10) 要出現新訂單 ${newId}：正規化快取只會更新已經存在的物件，新的訂單不在任何列表裡。在 updates.Mutation.placeOrder 讓這位顧客的 orders 欄位失效（cache.inspectFields 找出每一組參數，再 cache.invalidate）`)
  const few = await history(small)
  assert.deepEqual(ids(few.data), [newId], `orders(first: ${small}) 也要出現新訂單：不同參數是不同的欄位，invalidate 要帶上 inspectFields 回傳的 arguments，每一組都失效`)
  assert.equal(sent.length, 6, `下單後兩份歷史各重新查一次，總共應該是 6 個請求（實際 ${sent.length} 個）`)
  assert.deepEqual(ids((await otherHistory()).data), other, '別位顧客的歷史不受影響')
  assert.equal(sent.length, 6, `別位顧客的歷史跟這張新訂單無關，應該直接用快取，卻又送出了請求：只讓下單顧客（args.input.customerId）的 orders 欄位失效，不要整個 Query 或所有顧客一起失效`)
})
