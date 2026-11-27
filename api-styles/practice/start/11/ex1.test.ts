import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { Code, ConnectError, createClient, type ConnectRouter, type HandlerContext, type Interceptor } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { buildBff } from './server.ts'
import type { MenuProduct, MenuSource } from './bff.ts'
import { listen } from '../../helpers/http.ts'
import { gql } from '../../helpers/graphql.ts'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const QUERY = '{ menuWithStock { id name price available } }'
const show = (v: unknown) => JSON.stringify(v)

// 每個測試一份新的菜單：順序打亂、價格調整、多一個季節限定商品；庫存數字也隨機（其中一個是 0）
function freshMenu() {
  const products: MenuProduct[] = shuffle(PRODUCTS, random).map(p => ({ id: p.id, name: p.name, price: p.price + 5 * Math.floor(random() * 4) }))
  products.push({ id: String(7 + Math.floor(random() * 50)), name: '季節限定・桂花拿鐵', price: 130 + 5 * Math.floor(random() * 4) })
  const stock = new Map(products.map(p => [p.id, 1 + Math.floor(random() * 30)]))
  stock.set(products[Math.floor(random() * products.length)].id, 0)
  return { products, stock }
}

type ListStock = (ctx: HandlerContext) => Promise<Map<string, number>>

// 測試自己的庫存服務：listStock 的行為由每個測試決定；記錄每次呼叫與 client 送出的 grpc-timeout 標頭
async function start(listStock: ListStock, menu: MenuSource, budgetMs: number) {
  const calls: HandlerContext[] = []
  const routes = (router: ConnectRouter) => router.service(InventoryService, {
    async listStock(_req, ctx) {
      calls.push(ctx)
      const levels: Record<string, { productId: string, available: number }> = {}
      for (const [productId, available] of await listStock(ctx)) levels[productId] = { productId, available }
      return { levels }
    },
  })
  const sentTimeouts: (string | null)[] = []
  const record: Interceptor = next => req => { sentTimeouts.push(req.header.get('grpc-timeout')); return next(req) }
  const { url } = await listen(http2.createServer(connectNodeAdapter({ routes })))
  const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: url, interceptors: [record] }))
  // 假的時鐘：時間停在 t0，所以剩餘預算剛好是 budgetMs，跟機器快慢無關
  const t0 = 1_700_000_000_000 + Math.floor(random() * 1e9)
  const yoga = buildBff({ menu, inventory, now: () => t0, budgetMs })
  return { yoga, calls, sentTimeouts }
}

const menuOf = (products: MenuProduct[]): MenuSource => ({ list: async () => products.map(p => ({ ...p })) })
// 只在 signal abort 時結束：模擬卡住的庫存服務
const hang: ListStock = ctx => new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason)))

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise(r => setTimeout(r, 10))
  return check()
}

function assertDegraded(body: any, products: MenuProduct[], secret?: string) {
  const items = body.data?.menuWithStock
  assert.ok(Array.isArray(items), `庫存失敗時菜單還是要回傳，現在 data 是 ${show(body.data)}。` +
    '如果 data 是 null：schema.graphql 的 available 還是 Int!，欄位錯誤往上傳染到整個商品、整個列表，要改成可為 null 的 Int；' +
    '如果整個請求失敗：用 Promise.allSettled，庫存失敗時不要把錯誤丟出 menuWithStock')
  assert.equal(items.length, products.length, `菜單要有 ${products.length} 個商品`)
  products.forEach((p, i) => {
    assert.equal(items[i].name, p.name, `第 ${i} 個商品的名字要照菜單服務的順序：${p.name}`)
    assert.equal(items[i].price, p.price, `${p.name} 的價格要是菜單服務給的 ${p.price}`)
    assert.equal(items[i].available, null, `庫存拿不到時，${p.name} 的 available 要是 null`)
  })
  const errors = body.errors ?? []
  assert.equal(errors.length, products.length, `每個商品的 available 各有一筆錯誤，應該有 ${products.length} 筆，現在：${show(errors)}`)
  errors.forEach((e: any, i: number) => {
    assert.equal(e.extensions?.code, 'INVENTORY_UNAVAILABLE', `錯誤的 extensions.code 要是 INVENTORY_UNAVAILABLE（用 inventoryUnavailable()），現在：${show(e)}`)
    assert.deepEqual(e.path, ['menuWithStock', i, 'available'], `錯誤的 path 要指到 available 欄位，現在：${show(e.path)}`)
  })
  if (secret) assert.ok(!show(body).includes(secret), `回應裡出現了內部錯誤的細節「${secret}」：前端只該看到 inventoryUnavailable() 的訊息，細節寫進 log`)
}

test('正常：每個商品帶著正確的 available，順序照菜單；timeoutMs = 剩餘預算 − 20', opts, async () => {
  const { products, stock } = freshMenu()
  const budget = 300 + Math.floor(random() * 600)
  const { yoga, sentTimeouts } = await start(async () => stock, menuOf(products), budget)
  const { body } = await gql(yoga, QUERY)
  assert.equal(body.errors, undefined, `不應該有錯誤：${show(body.errors)}`)
  assert.deepEqual(body.data?.menuWithStock, products.map(p => ({ ...p, available: stock.get(p.id) })),
    'menuWithStock 要是菜單服務的商品（同樣順序、名字、價格），加上 listStock 回傳的 available（0 也要是 0，不是 null）')
  assert.equal(sentTimeouts[0], `${budget - 20}m`,
    `剩餘預算是 ${budget} ms，呼叫 listStock 的 timeoutMs 要是 ${budget - 20}（ctx.deadline − ctx.now() − MIN_BUDGET_MS），` +
    `實際送出的 grpc-timeout 是 ${sentTimeouts[0]}。時間一律用 ctx.now()，不要寫死、不要用 Date.now()`)
})

test('庫存服務回 UNAVAILABLE：菜單照常回傳，available 都是 null，errors 標示 INVENTORY_UNAVAILABLE', opts, async () => {
  const { products } = freshMenu()
  const secret = `inventory-db-${Math.floor(random() * 1000)}.internal 連線被拒`
  const { yoga } = await start(async () => { throw new ConnectError(secret, Code.Unavailable) }, menuOf(products), 500)
  const { body } = await gql(yoga, QUERY)
  assertDegraded(body, products, secret)
})

test('庫存服務卡住：在預算內放棄，菜單照常回傳', opts, async () => {
  const { products } = freshMenu()
  const budget = 150 + Math.floor(random() * 150)
  const { yoga, calls } = await start(hang, menuOf(products), budget)
  const t = Date.now()
  const { body } = await gql(yoga, QUERY)
  const elapsed = Date.now() - t
  assert.equal(calls.length, 1, '要呼叫一次 listStock')
  assertDegraded(body, products)
  assert.ok(elapsed < budget + 1500, `預算 ${budget} ms，請求卻花了 ${elapsed} ms：listStock 要帶 { timeoutMs }`)
})

test('菜單與庫存同時呼叫：任何一個完成之前，兩個都已經出發', opts, async () => {
  const { products, stock } = freshMenu()
  const menuGate = deferred<void>(), stockGate = deferred<void>()
  let menuCalled = false
  const menu: MenuSource = { async list() { menuCalled = true; await menuGate.promise; return products } }
  const { yoga, calls } = await start(async () => { await stockGate.promise; return stock }, menu, 3000)
  const pending = gql(yoga, QUERY)
  const both = await waitFor(() => menuCalled && calls.length === 1)
  const state = `菜單${menuCalled ? '已' : '沒有'}呼叫、庫存${calls.length ? '已' : '沒有'}呼叫`
  menuGate.resolve(); stockGate.resolve()
  const { body } = await pending
  assert.ok(both, `兩個下游都還沒完成時，${state}：兩個下游要同時出發（先各自呼叫拿到 Promise，再一起 await），` +
    '不要 await 菜單之後才呼叫庫存，延遲會相加')
  assert.equal(body.errors, undefined, `不應該有錯誤：${show(body.errors)}`)
})

test('剩餘預算只有 15 或 20 ms：不呼叫庫存服務，直接標示失敗', opts, async () => {
  for (const budget of [15, 20]) {
    const { products, stock } = freshMenu()
    const { yoga, calls } = await start(async () => stock, menuOf(products), budget)
    const { body } = await gql(yoga, QUERY)
    assert.equal(calls.length, 0, `剩 ${budget} ms 時 timeoutMs 是 ${budget - 20}，不該呼叫 listStock：` +
      'timeoutMs <= 0 時直接當成庫存失敗（注意 Connect 把 0 或負數的 timeoutMs 當成「不設逾時」）')
    assertDegraded(body, products)
  }
})

test('菜單服務失敗：整個 menuWithStock 失敗，不回空的菜單', opts, async () => {
  const { stock } = freshMenu()
  const secret = `menu-db-${Math.floor(random() * 1000)}.internal 連線被拒`
  const menu: MenuSource = { list: async () => { throw new Error(secret) } }
  const { yoga } = await start(async () => stock, menu, 500)
  const { body } = await gql(yoga, QUERY)
  assert.equal(body.data, null, `菜單是必要的：拿不到菜單時 menuWithStock 要失敗（把菜單的錯誤丟出去），data 是 null。` +
    `現在 data 是 ${show(body.data)}；回傳空陣列或只有庫存的資料，前端會以為今天沒有商品`)
  assert.deepEqual(body.errors?.map((e: any) => e.path), [['menuWithStock']], `errors 要有一筆指到 menuWithStock 的錯誤，現在：${show(body.errors)}`)
  assert.ok(!show(body).includes(secret), `回應裡出現了內部錯誤的細節「${secret}」`)
})
