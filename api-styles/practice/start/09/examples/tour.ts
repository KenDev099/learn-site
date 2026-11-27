// 在 work/09 執行：node examples/tour.ts
// 一個程序裡開伺服器、建 client，依序示範：unary、metadata 與 interceptor、server streaming、client streaming、deadline
import http2 from 'node:http2'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { Code, ConnectError, createClient, type ConnectRouter, type Interceptor } from '@connectrpc/connect'
import { InventoryService } from '../gen/coffee/inventory/v1/inventory_pb.js'

const stock = new Map([['1', 12], ['2', 5], ['6', 0]])

const routes = (router: ConnectRouter) => router.service(InventoryService, {
  // unary：一個請求、一個回應
  async getStock(req, ctx) {
    console.log(`  [伺服器] getStock 協定=${ctx.protocolName} x-request-id=${ctx.requestHeader.get('x-request-id')} 剩餘=${ctx.timeoutMs() ?? '沒有 deadline'}`)
    if (req.productIds.includes('slow')) {
      // 假裝下游很慢：只在這次 RPC 被取消或逾時時結束
      await new Promise(r => ctx.signal.addEventListener('abort', r))
      console.log(`  [伺服器] signal abort 了，原因：${ctx.signal.reason}`)
      throw ctx.signal.reason
    }
    const levels: Record<string, { productId: string, available: number }> = {}
    for (const id of req.productIds) {
      const available = stock.get(id)
      if (available === undefined) throw new ConnectError(`找不到商品 ${id}`, Code.NotFound)
      levels[id] = { productId: id, available }
    }
    return { levels }
  },
  // server streaming：async generator，每 yield 一次就送出一筆
  async *watchStock(req, ctx) {
    let available = stock.get(req.productId) ?? 0
    while (!ctx.signal.aborted && available >= 0) {
      yield { productId: req.productId, available }
      available--
      await new Promise(r => setTimeout(r, 50))
    }
    console.log(`  [伺服器] watchStock 結束，signal.aborted=${ctx.signal.aborted}`)
  },
  // client streaming：req 是 async iterable，用 for await 一筆一筆讀，讀完回一個回應
  async restock(requests) {
    let receivedItems = 0, totalQuantity = 0
    for await (const r of requests) {
      stock.set(r.productId, (stock.get(r.productId) ?? 0) + r.quantity)
      receivedItems++
      totalQuantity += r.quantity
    }
    return { receivedItems, totalQuantity }
  },
})

const server = http2.createServer(connectNodeAdapter({ routes }))
server.listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`

// interceptor：每個呼叫都會經過它，適合統一加 metadata
let n = 0
const requestId: Interceptor = next => req => {
  req.header.set('x-request-id', `tour-${++n}`)
  return next(req)
}
const client = createClient(InventoryService, createGrpcTransport({ baseUrl, interceptors: [requestId] }))

console.log('1. unary')
const res = await client.getStock({ productIds: ['1', '2'] }, { timeoutMs: 1000 })
console.log('  ', Object.values(res.levels).map(l => `${l.productId}:${l.available}`).join(' '))

console.log('2. 錯誤是 ConnectError，帶狀態碼')
try {
  await client.getStock({ productIds: ['99'] })
} catch (e) {
  const err = ConnectError.from(e)
  console.log(`   code=${err.code}（${Code[err.code]}） message=${err.rawMessage}`)
}

console.log('3. server streaming：收到 3 筆後 break')
for await (const level of client.watchStock({ productId: '1' })) {
  console.log(`   收到 available=${level.available}`)
  if (level.available === 10) break
}
await new Promise(r => setTimeout(r, 100))

console.log('4. client streaming：送 3 筆補貨')
async function* deliveries() {
  yield { productId: '2', quantity: 10 }
  yield { productId: '6', quantity: 4 }
  yield { productId: '2', quantity: 6 }
}
const summary = await client.restock(deliveries())
console.log(`   收到 ${summary.receivedItems} 筆、共 ${summary.totalQuantity} 份，拿鐵現在 ${stock.get('2')}`)

console.log('5. deadline：client 只等 200 ms')
const started = Date.now()
try {
  await client.getStock({ productIds: ['slow'] }, { timeoutMs: 200 })
} catch (e) {
  console.log(`   ${Code[ConnectError.from(e).code]}，等了約 ${Math.round((Date.now() - started) / 100) * 100} ms`)
}
await new Promise(r => setTimeout(r, 100))
server.close()
