import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { callWithGrpcJs } from './interop.ts'
import { listen } from '../../helpers/http.ts'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

// 測試自己的 Connect 伺服器：商品 'slow' 只在 deadline 到（ctx.signal abort）時才結束
async function start() {
  const stock = new Map(PRODUCTS.map(p => [p.id, 1 + Math.floor(random() * 40)]))
  const empty = shuffle(PRODUCTS, random)[0].id
  stock.set(empty, 0)
  const aborted: unknown[] = []
  const routes = (router: ConnectRouter) => router.service(InventoryService, {
    async getStock(req, ctx) {
      if (req.productIds.includes('slow')) {
        await new Promise(resolve => ctx.signal.aborted ? resolve(0) : ctx.signal.addEventListener('abort', resolve))
        aborted.push(ctx.signal.reason)
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
  })
  const { port } = await listen(http2.createServer(connectNodeAdapter({ routes })))
  return { address: `127.0.0.1:${port}`, stock, empty, aborted }
}

async function within<T>(p: Promise<T>, msg: string) {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), 3000) })])
  } finally {
    clearTimeout(timer)
  }
}

test('grpc-js 呼叫 Connect 伺服器，拿到每個商品的庫存（包括 0）', opts, async () => {
  const { address, stock, empty } = await start()
  const ids = [empty, ...shuffle(PRODUCTS.filter(p => p.id !== empty), random).slice(0, 2).map(p => p.id)]
  const res = await within(callWithGrpcJs(address, ids, 2000), '3 秒內沒有結果：callback 裡要 resolve')
  assert.ok(res.ok, `呼叫應該成功，卻得到 ${JSON.stringify(res)}。如果 code 是 DEADLINE_EXCEEDED：grpc-js 的 deadline 是絕對時間點（Date.now() + ms），不是毫秒數`)
  if (!res.ok) return
  assert.deepEqual(Object.keys(res.levels).sort(), [...ids].sort(), 'levels 的 key 要是要查的商品 id')
  for (const id of ids.slice(1)) assert.equal(res.levels[id], stock.get(id), `商品 ${id} 的庫存要是 ${stock.get(id)}`)
  assert.equal(res.levels[empty], 0,
    `商品 ${empty} 的庫存是 0，實際讀到 ${res.levels[empty]}：proto3 不會送出預設值 0，protoLoader.loadSync 要設 defaults: true，讀到的欄位才會補上 0`)
})

test('NOT_FOUND 回傳狀態碼的名稱', opts, async () => {
  const { address } = await start()
  const res = await within(callWithGrpcJs(address, ['1', '99'], 2000), '3 秒內沒有結果：失敗時 callback 也要 resolve')
  assert.ok(!res.ok, '商品 99 不存在，結果的 ok 應該是 false')
  if (res.ok) return
  assert.equal(res.code, 'NOT_FOUND', `code 要是 gRPC 狀態碼的名稱 'NOT_FOUND'，實際是 ${JSON.stringify(res.code)}。err.code 是數字（5），用 grpc.status[err.code] 換成名稱；gRPC 狀態碼和 HTTP 狀態碼是兩套東西`)
  assert.equal(typeof res.message, 'string', 'message 放 err.details（伺服器給的訊息）')
  assert.equal(res.message, '找不到商品 99', `message 要剛好是伺服器給的錯誤訊息 '找不到商品 99'（err.details），實際是 ${JSON.stringify(res.message)}。err.message 前面多了狀態碼，例如 '5 NOT_FOUND: …'`)
})

test('deadline 到時回傳 DEADLINE_EXCEEDED，伺服器也收到取消', opts, async () => {
  const { address, aborted } = await start()
  const res = await within(callWithGrpcJs(address, ['slow'], 150), '3 秒內沒有結果：要設 { deadline: Date.now() + ms }，不然會永遠等下去')
  assert.ok(!res.ok, '伺服器不會在 150 ms 內回應，結果的 ok 應該是 false')
  if (res.ok) return
  assert.equal(res.code, 'DEADLINE_EXCEEDED', `code 應該是 'DEADLINE_EXCEEDED'，實際是 ${JSON.stringify(res.code)}`)
  const end = Date.now() + 2000
  while (!aborted.length && Date.now() < end) await new Promise(r => setTimeout(r, 10))
  assert.equal(aborted.length, 1, 'grpc-js 送出的 deadline 應該讓伺服器的 ctx.signal 也 abort（grpc-timeout 標頭）')
})
