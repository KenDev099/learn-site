import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { quietYogaLogs } from '../../helpers/graphql.ts'
import { generated, recordingFetch, setup } from './testdata.ts'

quietYogaLogs()
const opts = { timeout: 10_000 }
const json = (v: unknown) => v === undefined ? undefined : JSON.parse(JSON.stringify(v))

// src/client.ts 會 import 練習 1 產生的檔案：還沒產生時，每個測試都顯示同一個說明
async function load(): Promise<any> {
  await generated()
  try {
    return await import('./src/client.ts')
  } catch (e) {
    throw new Error(`src/client.ts 沒辦法載入：${(e as Error).message.split('\n')[0]}`)
  }
}

function historyOf(store: ReturnType<typeof setup>['store'], customerId: string, first: number) {
  return store.orders
    .filter(o => o.customerId === customerId)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt) || Number(b.id) - Number(a.id))
    .slice(0, first)
    .map(o => ({ id: o.id, total: o.total, status: o.status }))
}
const nodes = (data: any) => (data?.customer?.orders?.edges ?? []).map((e: any) => ({ id: e.node.id, total: e.node.total, status: e.node.status }))

test('loadHistory 用 codegen 產生的 OrderHistoryDocument 查詢，回傳 { data, error }', opts, async () => {
  const { createHistoryClient, loadHistory } = await load()
  const source = readFileSync(new URL('./src/client.ts', import.meta.url), 'utf8')
  assert.match(source, /from\s+['"]\.\/gql\/(graphql|index)\.ts['"]/, 'client.ts 要從 ./gql/graphql.ts import 產生的 OrderHistoryDocument、PlaceOrderDocument（和型別），不要自己手寫查詢字串與回應型別')
  assert.doesNotMatch(source, /\bquery\s+OrderHistory\b|\bmutation\s+PlaceOrder\b/, 'client.ts 裡不要再寫一份查詢文字：查詢只寫在 .graphql 檔，型別由 codegen 產生，兩邊才不會不一致')

  const { store, yoga, withOrders, random } = setup()
  const { fetch, sent } = recordingFetch(yoga)
  const client = createHistoryClient(fetch)
  const customerId = withOrders[0]
  const first = 2 + Math.floor(random() * 3)
  const result = await loadHistory(client, customerId, first)
  assert.ok(result && 'data' in result && 'error' in result, 'loadHistory 要回傳 { data, error } 這個物件（error 沒有錯誤時是 undefined）')
  assert.equal(sent.length, 1, `loadHistory 應該送出 1 個請求，實際送出 ${sent.length} 個`)
  assert.equal(sent[0].operationName, 'OrderHistory', `送出的操作名稱應該是 OrderHistory，實際是 ${sent[0].operationName}`)
  assert.deepEqual(sent[0].variables, { customerId, first }, '變數要是 { customerId, first }')
  assert.equal(result.error, undefined, `不應該有錯誤：${result.error?.message}`)
  assert.equal(result.data?.customer?.name, store.customers.find(c => c.id === customerId)!.name, 'data.customer.name 不對')
  assert.deepEqual(nodes(result.data), historyOf(store, customerId, first), 'data.customer.orders.edges 的訂單（id、total、status）跟伺服器的資料不一致')
})

test('同一個 client 再查同一份歷史，直接用快取、不再送請求', opts, async () => {
  const { createHistoryClient, loadHistory } = await load()
  const { store, yoga, withOrders } = setup()
  const { fetch, sent } = recordingFetch(yoga)
  const client = createHistoryClient(fetch)
  const customerId = withOrders[1]
  const a = await loadHistory(client, customerId, 5)
  const b = await loadHistory(client, customerId, 5)
  assert.deepEqual(nodes(b.data), historyOf(store, customerId, 5), '第二次的結果要跟第一次一樣')
  assert.equal(sent.length, 1, `查了兩次、送出 ${sent.length} 個請求：第二次應該直接從快取拿。requestPolicy 用 cache-first（network-only、cache-and-network 的 toPromise 都會等網路），而且 loadHistory 要用傳進來的 client，不要每次建新的（快取存在 client 裡）`)
  assert.deepEqual(json(a.data), json(b.data), '兩次的 data 要一樣')
  await loadHistory(client, customerId, 3)
  assert.equal(sent.length, 2, '變數不同（first: 3）是另一個快取鍵，要送新的請求')
})

test('下單後再查歷史看得到新訂單，原本列表是空的也一樣', opts, async () => {
  const { createHistoryClient, loadHistory, placeOrder } = await load()
  const { store, yoga, empty, random } = setup()
  const { fetch, sent } = recordingFetch(yoga)
  const client = createHistoryClient(fetch)
  const before = await loadHistory(client, empty, 5)
  assert.deepEqual(nodes(before.data), [], '這位顧客一開始沒有訂單，edges 應該是空陣列')

  const product = store.products[Math.floor(random() * store.products.length)]
  const quantity = 1 + Math.floor(random() * 3)
  const placed = await placeOrder(client, { customerId: empty, lines: [{ productId: product.id, quantity }] })
  assert.equal(placed.error, undefined, `下單不應該有錯誤：${placed.error?.message}`)
  assert.equal(placed.data?.placeOrder.total, product.price * quantity, 'placeOrder 回傳的 total 不對（要用 placeOrder 的回傳值）')
  const newId = placed.data!.placeOrder.id

  const after = await loadHistory(client, empty, 5)
  assert.equal(sent.length, 3, `下單後的 loadHistory 要重新查詢（查詢、下單、查詢共 3 個請求，實際 ${sent.length} 個）。空列表的結果裡沒有 Order 型別，mutation 回傳 Order 時 document cache 不知道這份查詢跟它有關：查詢時加上 context { additionalTypenames: ['Order'] }`)
  assert.deepEqual(nodes(after.data).map((n: { id: string }) => n.id), [newId], '下單後的歷史要有剛建立的訂單')
})

test('GraphQL 錯誤轉成 error 並保留 data；網路錯誤也回傳 error，不丟例外', opts, async () => {
  const { createHistoryClient, loadHistory, placeOrder } = await load()
  const { store, yoga, withOrders } = setup()
  const broken = withOrders[2]
  store.broken.add(broken)
  const { fetch } = recordingFetch(yoga)
  const client = createHistoryClient(fetch)
  let result
  try {
    result = await loadHistory(client, broken, 3)
  } catch (e) {
    assert.fail(`loadHistory 不要丟例外，把錯誤放在回傳的 error：${(e as Error).message}`)
  }
  assert.ok(result.error, '伺服器回了 errors，回傳值的 error 不能是 undefined（不要把錯誤吞掉）')
  assert.match(result.error.graphQLErrors[0]?.message ?? '', /讀不到顧客/, 'error.graphQLErrors 要保留伺服器的錯誤訊息')
  assert.deepEqual(json(result.data), { customer: null }, '有錯誤時 data 也要保留（這裡是 { customer: null }），畫面可以顯示還拿得到的部分')

  const offline = createHistoryClient((async () => { throw new TypeError('fetch failed') }) as typeof globalThis.fetch)
  let down
  try {
    down = await loadHistory(offline, withOrders[0], 3)
  } catch (e) {
    assert.fail(`網路錯誤時 loadHistory 也不要丟例外：${(e as Error).message}`)
  }
  assert.ok(down.error?.networkError, '網路錯誤要在 error.networkError')
  assert.equal(down.data, undefined, '網路錯誤時沒有 data')

  let bad
  try {
    bad = await placeOrder(client, { customerId: withOrders[0], lines: [{ productId: '999', quantity: 1 }] })
  } catch (e) {
    assert.fail(`placeOrder 失敗時也不要丟例外：${(e as Error).message}`)
  }
  assert.match(bad.error?.message ?? '', /品項不正確/, 'placeOrder 的錯誤也要放在回傳的 error')
})
