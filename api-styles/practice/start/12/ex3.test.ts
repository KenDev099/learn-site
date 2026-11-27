import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { randomUUID } from 'node:crypto'
import { Code, ConnectError, createClient, type ConnectRouter } from '@connectrpc/connect'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { InventoryService, OutOfStockDetailSchema } from './gen/coffee/inventory/v1/inventory_pb.js'
import { listen } from '../../helpers/http.ts'
import { inventoryRoutes } from './inventory/server.ts'
import { int, setup } from './testkit.ts'

const opts = { timeout: 30_000 }

const PLACE = /* GraphQL */ `
  mutation ($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      __typename
      ... on OrderPlaced { order { id total } }
      ... on OutOfStock { productId available }
      ... on InventoryUnavailable { reason }
    }
  }`
const orderCount = async (pg: { query<T>(s: string): Promise<{ rows: T[] }> }) =>
  (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM orders')).rows[0].n

// 永遠不會自己回應、只在 deadline 到或被取消時結束的庫存服務：結果只取決於 deadline 有沒有設，跟機器快慢無關
function hangingRoutes() {
  const calls: string[] = []
  const wait = (signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  const routes = (router: ConnectRouter) => router.service(InventoryService, {
    getStock: (_req, ctx) => { calls.push('getStock'); return wait(ctx.signal) },
    reserve: (_req, ctx) => { calls.push('reserve'); return wait(ctx.signal) },
  })
  return { routes, calls }
}

async function within<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms) })])
  } finally { clearTimeout(timer) }
}

test('庫存服務的 Reserve：同一個 idempotency key 只扣一次；庫存不夠時一項都不扣並附 OutOfStockDetail', opts, async () => {
  const stock = new Map([['1', 10 + int(20)], ['2', 10 + int(20)]])
  const start = new Map(stock)
  const { url } = await listen(http2.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) })))
  const client = createClient(InventoryService, createGrpcTransport({ baseUrl: url }))
  const key = randomUUID(), qty = 1 + int(4)
  const first = await client.reserve({ idempotencyKey: key, items: [{ productId: '1', quantity: qty }, { productId: '2', quantity: 1 }] })
  // 第一次其實成功了，但 client 逾時沒收到回應，於是用同一個 key 重試
  const retry = await client.reserve({ idempotencyKey: key, items: [{ productId: '1', quantity: qty }, { productId: '2', quantity: 1 }] })
  assert.equal(stock.get('1'), start.get('1')! - qty,
    `同一個 idempotency key 重送了兩次，商品 1 被扣了 ${start.get('1')! - stock.get('1')!} 份（應該只扣 ${qty} 份）：庫存服務要記住做過的 key，再來時直接回第一次的回應`)
  assert.deepEqual(retry.remaining.map(l => [l.productId, l.available]), first.remaining.map(l => [l.productId, l.available]), '重送要拿到跟第一次一樣的回應')
  await client.reserve({ idempotencyKey: randomUUID(), items: [{ productId: '1', quantity: 1 }] })
  assert.equal(stock.get('1'), start.get('1')! - qty - 1, '不同的 key 是另一筆預留，要照常扣')

  const before = new Map(stock)
  const err = await client.reserve({ idempotencyKey: randomUUID(), items: [{ productId: '2', quantity: 1 }, { productId: '1', quantity: 999 }] }).then(() => null, e => ConnectError.from(e))
  assert.ok(err, '庫存不夠時 Reserve 要失敗')
  assert.equal(Code[err.code], 'FailedPrecondition', `庫存不夠要回 FAILED_PRECONDITION，實際是 ${Code[err.code]}`)
  assert.deepEqual(err.findDetails(OutOfStockDetailSchema).map(d => [d.productId, d.available]), [['1', before.get('1')]], '錯誤細節要有 OutOfStockDetail（不夠的商品與剩餘數量）')
  assert.deepEqual(stock, before, '庫存不夠時一項都不能扣')
})

test('搶最後 10 杯拿鐵：同時 30 張訂單，恰好 10 張成功，庫存變成 0，不會超賣', opts, async () => {
  const left = 8 + int(5)
  const { ask, login, pg, stock } = await setup({ stock: new Map([['1', 50], ['2', left], ['3', 50], ['4', 50], ['5', 50], ['6', 50]]) })
  const before = await orderCount(pg)
  const results = await Promise.all(Array.from({ length: 30 }, () =>
    ask(PLACE, { input: { clientOrderId: randomUUID(), lines: [{ productId: '2', quantity: 1 }] } }, login(String(1 + int(6))))))
  for (const r of results) assert.equal(r.body.errors, undefined, `下單不應該有錯誤：${JSON.stringify(r.body.errors)}`)
  const kinds = results.map(r => r.body.data.placeOrder.__typename)
  assert.equal(kinds.filter(k => k === 'OrderPlaced').length, left, `只剩 ${left} 杯，應該恰好 ${left} 張 OrderPlaced，實際：${kinds.join(', ')}`)
  assert.equal(kinds.filter(k => k === 'OutOfStock').length, 30 - left, '其餘的要是 OutOfStock')
  assert.equal(stock.get('2'), 0, `拿鐵的庫存應該是 0，實際是 ${stock.get('2')}`)
  assert.equal(await orderCount(pg) - before, left, `資料庫應該多 ${left} 張訂單：庫存不夠的那幾張不能留下訂單（先 Reserve，成功才建立訂單）`)
})

test('同一個 clientOrderId 送兩次：只建立一張訂單、只扣一次庫存、回同一張訂單', opts, async () => {
  const { ask, login, pg, stock } = await setup()
  const me = login(String(1 + int(6)))
  const qty = 1 + int(3)
  const startStock = stock.get('4')!
  const before = await orderCount(pg)
  const input = { clientOrderId: randomUUID(), lines: [{ productId: '4', quantity: qty }] }
  const a = await ask(PLACE, { input }, me)
  const b = await ask(PLACE, { input }, me)
  const [c, d] = await Promise.all([ask(PLACE, { input: { ...input, clientOrderId: input.clientOrderId + '-x' } }, me), ask(PLACE, { input: { ...input, clientOrderId: input.clientOrderId + '-x' } }, me)])
  for (const r of [a, b, c, d]) assert.equal(r.body.data?.placeOrder?.__typename, 'OrderPlaced', `每次都要回 OrderPlaced：${JSON.stringify(r.body)}`)
  assert.equal(a.body.data.placeOrder.order.id, b.body.data.placeOrder.order.id, '重送要回第一次建立的那張訂單：先用 clientOrderId 查有沒有下過')
  assert.equal(c.body.data.placeOrder.order.id, d.body.data.placeOrder.order.id, '同時送兩次也只能有一張訂單：INSERT 用 ON CONFLICT (customer_id, client_order_id) DO NOTHING，沒插入時查出已存在的那張')
  assert.equal(await orderCount(pg) - before, 2, '兩個不同的 clientOrderId，資料庫應該只多 2 張訂單')
  assert.equal(stock.get('4'), startStock - 2 * qty, `庫存應該只扣兩次（每個 clientOrderId 一次），實際扣了 ${(startStock - stock.get('4')!) / qty} 次`)
  const [row] = (await pg.query<{ total: number, items: number }>(
    'SELECT o.total, (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS items FROM orders o WHERE id = $1', [Number(a.body.data.placeOrder.order.id)])).rows
  assert.equal(row.items, 1, '訂單要有品項')
  assert.equal(row.total, 90 * qty, 'total 要等於品項小計')
})

test('兩位顧客剛好用了同一個 clientOrderId：各自是一筆下單，各扣各的庫存', opts, async () => {
  const { ask, login, pg, stock } = await setup()
  const [a, b] = [String(1 + int(3)), String(4 + int(3))]
  const qty = 1 + int(3)
  const startStock = stock.get('5')!
  const input = { clientOrderId: `order-${int(1000)}`, lines: [{ productId: '5', quantity: qty }] }
  const ra = await ask(PLACE, { input }, login(a))
  const rb = await ask(PLACE, { input }, login(b))
  for (const r of [ra, rb]) assert.equal(r.body.data?.placeOrder?.__typename, 'OrderPlaced', `每位顧客都要回 OrderPlaced：${JSON.stringify(r.body)}`)
  assert.notEqual(ra.body.data.placeOrder.order.id, rb.body.data.placeOrder.order.id, '不同顧客的下單是不同的訂單')
  assert.equal(stock.get('5'), startStock - 2 * qty,
    `兩位顧客各下一單，庫存應該扣兩次，實際扣了 ${(startStock - stock.get('5')!) / qty} 次：Reserve 的 idempotency key 要包含顧客 id（\`\${顧客 id}:\${clientOrderId}\`），不然第二位顧客會拿到第一位的預留結果，變成賣出沒扣到的庫存`)
  const owners = (await pg.query<{ customer_id: number }>('SELECT customer_id FROM orders WHERE client_order_id = $1 ORDER BY customer_id', [input.clientOrderId])).rows
  assert.deepEqual(owners.map(r => String(r.customer_id)), [a, b], '兩位顧客各自要有一張訂單')
})

test('品項寫入失敗：訂單跟著回滾，不留下沒有品項的訂單', opts, async () => {
  const { ask, login, pg } = await setup()
  const productId = 1 + int(6)
  // 讓這個商品的品項寫不進去，模擬「訂單寫好了、品項寫到一半資料庫出錯」
  await pg.exec(`ALTER TABLE order_items ADD CONSTRAINT probe_${int(1e6)} CHECK (product_id <> ${productId}) NOT VALID`)
  const before = await orderCount(pg)
  const res = await ask(PLACE, { input: { clientOrderId: randomUUID(), lines: [{ productId: String(productId), quantity: 1 }] } }, login(String(1 + int(6))))
  assert.notEqual(res.body.data?.placeOrder?.__typename, 'OrderPlaced', '品項寫不進去時不能回 OrderPlaced')
  assert.equal(await orderCount(pg), before,
    '品項寫入失敗，資料庫卻留下一張訂單：訂單和品項要在同一個 ctx.db.transaction(async tx => …) 裡寫入，一起成功或一起失敗')
})

test('庫存服務不回應：placeOrder 在預算內回 InventoryUnavailable（TIMEOUT），deadline 依剩餘預算，不建立訂單', opts, async () => {
  const { routes, calls } = hangingRoutes()
  const budgetMs = 150 + int(150)
  const app = await setup({ routes, budgetMs })
  const before = await orderCount(app.pg)
  const res = await within(app.ask(PLACE, { input: { clientOrderId: randomUUID(), lines: [{ productId: '1', quantity: 1 }] } }, app.login('1')), 3000,
    '庫存服務不回應，placeOrder 等了 3 秒還沒回來：呼叫 Reserve 要帶 { timeoutMs }')
  assert.equal(calls.filter(c => c === 'reserve').length, 1, '應該呼叫 Reserve 一次')
  assert.deepEqual(res.body.data?.placeOrder, { __typename: 'InventoryUnavailable', reason: 'TIMEOUT' }, `逾時要回 InventoryUnavailable { reason: TIMEOUT }，實際：${JSON.stringify(res.body)}`)
  const sent = app.calls.find(c => c.method === 'Reserve')?.timeout
  assert.equal(sent, `${budgetMs - 20}m`, `預算 ${budgetMs} ms 時 Reserve 的 timeoutMs 應該是 ${budgetMs - 20}（剩餘預算 ctx.deadline − ctx.now() 再減 MARGIN_MS），實際的 grpc-timeout 標頭是 ${sent}`)
  assert.equal(await orderCount(app.pg), before, '逾時不能留下訂單')

  const menu = await within(app.ask('{ menuWithStock { available product { name } } }'), 3000, '庫存服務不回應時菜單也卡住了：GetStock 要帶 { timeoutMs }')
  assert.equal(menu.body.data?.menuWithStock?.length, 6, '庫存服務不回應時菜單仍要顯示 6 個商品')
  assert.ok(menu.body.data.menuWithStock.every((m: any) => m.available === null), 'available 要是 null')
})

test('剩餘預算不夠（扣掉 MARGIN_MS 後不到 MIN_CALL_MS）：不呼叫庫存服務，直接回 TIMEOUT', opts, async () => {
  const { routes, calls } = hangingRoutes()
  const app = await setup({ routes, budgetMs: 25 + int(14) })
  const res = await within(app.ask(PLACE, { input: { clientOrderId: randomUUID(), lines: [{ productId: '1', quantity: 1 }] } }, app.login('2')), 3000, 'placeOrder 卡住了')
  assert.deepEqual(res.body.data?.placeOrder, { __typename: 'InventoryUnavailable', reason: 'TIMEOUT' }, `預算不夠要回 InventoryUnavailable { reason: TIMEOUT }，實際：${JSON.stringify(res.body)}`)
  assert.equal(calls.length, 0, '剩餘時間扣掉 MARGIN_MS 後不到 MIN_CALL_MS，不應該呼叫庫存服務')
})

test('庫存服務掛掉：菜單照常顯示（available 是 null、errors 是 INVENTORY_UNAVAILABLE），下單回 DOWN 且不建立訂單', opts, async () => {
  const app = await setup({ inventoryDown: true })
  const menu = await app.ask('{ menuWithStock { available product { id name price } } }')
  assert.equal(menu.body.data?.menuWithStock?.length, 6, `庫存服務掛掉時菜單仍要有 6 個商品：stockFor 失敗時回 null，不要讓錯誤往外丟。實際：${JSON.stringify(menu.body).slice(0, 300)}`)
  assert.ok(menu.body.data.menuWithStock.every((m: any) => m.available === null && m.product.name), '商品資料照常，available 是 null')
  assert.ok(menu.body.errors?.length && menu.body.errors.every(e => e.extensions?.code === 'INVENTORY_UNAVAILABLE'), 'errors 的 code 要是 INVENTORY_UNAVAILABLE')
  assert.ok(app.errors.length > 0, '降級時要用 ctx.logger.error 記下庫存服務的錯誤，監控才看得到')

  const before = await orderCount(app.pg)
  const res = await app.ask(PLACE, { input: { clientOrderId: randomUUID(), lines: [{ productId: '3', quantity: 1 }] } }, app.login('3'))
  assert.deepEqual(res.body.data?.placeOrder, { __typename: 'InventoryUnavailable', reason: 'DOWN' }, `連不上庫存服務要回 InventoryUnavailable { reason: DOWN }，實際：${JSON.stringify(res.body)}`)
  assert.equal(await orderCount(app.pg), before, '庫存服務掛掉時不能留下訂單：先 Reserve 成功才建立訂單')
})
