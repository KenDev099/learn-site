import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { EventEmitter } from 'node:events'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { Code, ConnectError, createClient, type Interceptor } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { watchRoutes } from './watch.ts'
import { listen } from '../../helpers/http.ts'
import { PRODUCTS, mulberry32 } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

async function start(serverOnlyTimeout?: string) {
  const stock = new Map(PRODUCTS.map(p => [p.id, 10 + Math.floor(random() * 30)]))
  const changes = new EventEmitter()
  const setTimeoutHeader: Interceptor = next => req => {
    if (serverOnlyTimeout) req.header.set('grpc-timeout', serverOnlyTimeout)   // 只告訴伺服器 deadline，看伺服器怎麼結束串流
    return next(req)
  }
  const { url } = await listen(http2.createServer(connectNodeAdapter({ routes: watchRoutes(stock, changes) })))
  const client = createClient(InventoryService, createGrpcTransport({ baseUrl: url, interceptors: [setTimeoutHeader] }))
  return { client, stock, changes }
}
const listeners = (e: EventEmitter) => e.listenerCount('change')
async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise(r => setTimeout(r, 10))
  return check()
}

test('先送目前庫存，之後每次變動送一筆；client break 之後伺服器移除監聽', opts, async () => {
  const { client, stock, changes } = await start()
  const id = PRODUCTS[Math.floor(random() * PRODUCTS.length)].id
  const other = PRODUCTS.find(p => p.id !== id)!.id
  const current = stock.get(id)!
  const v1 = current - 1 - Math.floor(random() * 5), v2 = v1 - 1 - Math.floor(random() * 3)
  const got: number[] = []
  try {
    // timeoutMs 只是保險：伺服器一直不送，3 秒後 client 自己放棄
    for await (const msg of client.watchStock({ productId: id }, { timeoutMs: 3000 })) {
      assert.equal(msg.productId, id, `每一筆的 productId 都要是 '${id}'`)
      got.push(msg.available)
      if (got.length === 1) {
        assert.ok(await waitFor(() => listeners(changes) > 0), "送出第一筆之後，伺服器沒有監聽 changes 的 'change' 事件：要等事件，不要輪詢")
        changes.emit('change', { productId: other, available: 1 })     // 別的商品：不送
        changes.emit('change', { productId: id, available: current })  // 數字沒變：不送
        changes.emit('change', { productId: id, available: v1 })
        changes.emit('change', { productId: id, available: v1 })       // 重複：不送
        changes.emit('change', { productId: id, available: v2 })
      }
      if (got.length === 3) break   // client 取消串流
    }
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e
    const err = ConnectError.from(e)
    assert.fail(`串流在收到 ${got.length} 筆後就結束了（${Code[err.code]}：${err.rawMessage}）。要先 yield 目前的庫存，之後每收到一次變動就 yield 一次，不要等到最後才一起送`)
  }
  assert.deepEqual(got, [current, v1, v2], `應該依序收到 [目前庫存, ${v1}, ${v2}]：別的商品、數字沒變的變動都不要送`)
  assert.ok(await waitFor(() => listeners(changes) === 0),
    `client 取消之後，changes 上還有 ${listeners(changes)} 個 'change' 監聽：要在 ctx.signal abort 時移除（例如 events.on(changes, 'change', { signal: ctx.signal })），不然每個斷掉的 client 都留下一個監聽`)
})

test('deadline 到時串流以 DEADLINE_EXCEEDED 結束，監聽也被移除', opts, async () => {
  const { client, changes } = await start('300m')
  const got: number[] = []
  let code = 'OK（串流正常結束）'
  const watching = (async () => {
    try {
      for await (const msg of client.watchStock({ productId: '1' })) got.push(msg.available)
    } catch (e) {
      code = Code[ConnectError.from(e).code]
    }
  })()
  const finished = await Promise.race([watching.then(() => true), new Promise(r => setTimeout(r, 3000, false))])
  assert.ok(finished, '伺服器的 deadline 是 300 ms，過了 3 秒串流還沒結束：迴圈要在 ctx.signal abort 時停下來')
  assert.equal(got.length, 1, '沒有變動時只會收到目前庫存那一筆')
  assert.equal(code, 'DeadlineExceeded', `串流應該以 DeadlineExceeded 結束，實際是 ${code}。` + (code === 'Internal'
    ? 'events.on 被 abort 時丟的是 AbortError，Connect 會把它當成 Internal；在 catch 裡改丟 ctx.signal.reason'
    : 'deadline 到了要讓錯誤丟出去（throw ctx.signal.reason），不要吞掉錯誤、讓串流像正常結束一樣'))
  assert.ok(await waitFor(() => listeners(changes) === 0), `deadline 到了之後還有 ${listeners(changes)} 個 'change' 監聽沒移除`)
})

test('不存在的商品回 NOT_FOUND', opts, async () => {
  const { client } = await start()
  let code = 'OK（沒有丟錯）'
  try {
    for await (const _ of client.watchStock({ productId: '99' }, { timeoutMs: 3000 })) break
  } catch (e) {
    code = Code[ConnectError.from(e).code]
  }
  assert.equal(code, 'NotFound', `商品 99 不存在，要在 yield 之前丟 Code.NotFound，實際是 ${code}`)
})
