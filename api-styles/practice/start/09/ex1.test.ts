import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { Code, ConnectError, createClient } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { inventoryRoutes } from './server.ts'
import { listen } from '../../helpers/http.ts'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

// 每個測試一份新的庫存：隨機數量，其中一個商品是 0
function freshStock() {
  const stock = new Map(PRODUCTS.map(p => [p.id, 3 + Math.floor(random() * 30)]))
  stock.set(shuffle(PRODUCTS, random)[0].id, 0)
  return stock
}

async function start(stock: Map<string, number>) {
  const { url } = await listen(http2.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) })))
  return createClient(InventoryService, createGrpcTransport({ baseUrl: url }))
}

async function codeOf(call: Promise<unknown>) {
  try {
    await call
  } catch (e) {
    return ConnectError.from(e).code
  }
  return 'OK（沒有丟錯）'
}
const name = (c: Code | string) => typeof c === 'string' ? c : Code[c]

test('getStock 回傳每個要查的商品的庫存', opts, async () => {
  const stock = freshStock()
  const client = await start(stock)
  const ids = shuffle(PRODUCTS, random).slice(0, 3 + Math.floor(random() * 3)).map(p => p.id)
  const res = await client.getStock({ productIds: ids })
  assert.deepEqual(Object.keys(res.levels).sort(), [...ids].sort(), 'levels 的 key 要剛好是要查的商品 id')
  for (const id of ids) {
    assert.equal(res.levels[id].productId, id, `levels['${id}'].productId 要是 '${id}'`)
    assert.equal(res.levels[id].available, stock.get(id), `商品 ${id} 的 available 要是庫存 Map 裡的數字 ${stock.get(id)}`)
  }
})

test('getStock：空陣列回 INVALID_ARGUMENT，不存在的商品回 NOT_FOUND', opts, async () => {
  const client = await start(freshStock())
  const empty = await codeOf(client.getStock({ productIds: [] }))
  assert.equal(name(empty), 'InvalidArgument', `productIds 是空陣列時要丟 new ConnectError(…, Code.InvalidArgument)，現在是 ${name(empty)}：呼叫端送錯參數，重試也沒用`)
  const missing = `${7 + Math.floor(random() * 90)}`
  const notFound = await codeOf(client.getStock({ productIds: ['1', missing] }))
  assert.equal(name(notFound), 'NotFound', `商品 ${missing} 不存在時要丟 Code.NotFound，現在是 ${name(notFound)}：不要回傳 available 0，那會讓 client 以為「有這個商品但賣完了」`)
})

test('reserve 扣庫存並回傳剩餘數量', opts, async () => {
  const stock = freshStock()
  const client = await start(stock)
  const id = shuffle(PRODUCTS, random).find(p => stock.get(p.id)! > 2)!.id
  const before = stock.get(id)!
  const quantity = 1 + Math.floor(random() * (before - 1))
  const res = await client.reserve({ productId: id, quantity })
  assert.equal(res.productId, id, '回應的 productId 要是請求的商品')
  assert.equal(res.remaining, before - quantity, `庫存 ${before}、扣 ${quantity}，remaining 要是 ${before - quantity}`)
  assert.equal(stock.get(id), before - quantity, '要把扣完的數字寫回庫存 Map（stock.set）')
})

test('reserve 的錯誤：數量不合法、商品不存在、庫存不夠，而且失敗時庫存不變', opts, async () => {
  const stock = freshStock()
  const client = await start(stock)
  const snapshot = new Map(stock)
  const id = PRODUCTS[Math.floor(random() * PRODUCTS.length)].id
  const zero = await codeOf(client.reserve({ productId: id, quantity: 0 }))
  assert.equal(name(zero), 'InvalidArgument', `quantity 是 0 時要丟 Code.InvalidArgument，現在是 ${name(zero)}`)
  const negative = -1 - Math.floor(random() * 5)
  const neg = await codeOf(client.reserve({ productId: id, quantity: negative }))
  assert.equal(name(neg), 'InvalidArgument', `quantity 是 ${negative} 時也要丟 Code.InvalidArgument，現在是 ${name(neg)}：檢查要寫成「小於 1」，不然負數會讓庫存變多`)
  const missing = await codeOf(client.reserve({ productId: '99', quantity: 1 }))
  assert.equal(name(missing), 'NotFound', `商品不存在時要丟 Code.NotFound，現在是 ${name(missing)}`)
  const tooMany = await codeOf(client.reserve({ productId: id, quantity: stock.get(id)! + 1 }))
  assert.equal(name(tooMany), 'FailedPrecondition', `庫存不夠時要丟 Code.FailedPrecondition（系統的狀態不允許這個操作），現在是 ${name(tooMany)}。Internal 代表伺服器有 bug，client 會以為是我們壞了`)
  assert.deepEqual(stock, snapshot, '失敗的 reserve 不能改到庫存：先檢查夠不夠，夠了才 stock.set')
})

test('20 個並行的 reserve 搶最後 5 份拿鐵，剛好 5 個成功', opts, async () => {
  const stock = freshStock()
  stock.set('2', 5)
  const client = await start(stock)
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => client.reserve({ productId: '2', quantity: 1 })))
  const ok = results.filter(r => r.status === 'fulfilled')
  assert.equal(ok.length, 5, `應該剛好 5 個成功，實際 ${ok.length} 個`)
  for (const r of results) {
    if (r.status === 'rejected') assert.equal(name(ConnectError.from(r.reason).code), 'FailedPrecondition', '搶不到的要收到 FailedPrecondition')
  }
  assert.equal(stock.get('2'), 0, `最後庫存要是 0，實際是 ${stock.get('2')}`)
  assert.deepEqual(ok.map(r => r.value.remaining).sort(), [0, 1, 2, 3, 4], '5 個成功的 remaining 要是 4、3、2、1、0（順序不拘）')
})
