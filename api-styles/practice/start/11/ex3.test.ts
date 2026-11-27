import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { createJsonServer, fetchStockJson } from './connect-json.ts'
import { listen } from '../../helpers/http.ts'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

function freshStock() {
  const stock = new Map(PRODUCTS.map(p => [p.id, 1 + Math.floor(random() * 30)]))
  return stock
}

type Seen = { method?: string, url?: string, contentType?: string }
async function start(server: http.Server) {
  const seen: Seen[] = []
  server.on('request', (req: http.IncomingMessage) => seen.push({ method: req.method, url: req.url, contentType: req.headers['content-type'] }))
  const { url } = await listen(server)
  return { url, seen }
}

test('createJsonServer 是 HTTP/1.1 伺服器；fetchStockJson 用 Connect 協定（POST JSON）拿到庫存', opts, async () => {
  const stock = freshStock()
  const ids = shuffle(PRODUCTS, random).slice(0, 3 + Math.floor(random() * 3)).map(p => p.id)
  stock.set(ids[Math.floor(random() * ids.length)], 0)
  const server = createJsonServer(stock)
  assert.ok(server instanceof http.Server, 'createJsonServer 要用 http.createServer（HTTP/1.1）：瀏覽器的 fetch 走一般 HTTP，不需要 HTTP/2')
  const { url, seen } = await start(server)
  const res = await fetchStockJson(url, ids)
  assert.deepEqual(seen[0], { method: 'POST', url: '/coffee.inventory.v1.InventoryService/GetStock', contentType: 'application/json' },
    'Connect 協定的 unary：POST 到 /<package>.<Service>/<Method>，Content-Type: application/json')
  assert.ok('levels' in res, `應該成功，卻回傳 ${JSON.stringify(res)}`)
  assert.deepEqual(res.levels, Object.fromEntries(ids.map(id => [id, stock.get(id)])),
    `levels 要是「商品 id → 剩幾份」。注意 proto3 的 JSON 會省略預設值：庫存 0 的商品，回應裡沒有 available 欄位，要當成 0`)
})

test('商品不存在：回傳 Connect 錯誤 JSON 裡的 code（not_found）', opts, async () => {
  const { url } = await start(createJsonServer(freshStock()))
  const res = await fetchStockJson(url, ['1', String(7 + Math.floor(random() * 90))])
  assert.deepEqual(res, { code: 'not_found' }, '失敗時回傳 { code }，code 讀回應 body 的 JSON（{ "code": "not_found", "message": … }）')
})

test('錯誤的種類看 body 的 code，不是 HTTP 狀態碼', opts, async () => {
  // 這幾個 code 跟別的 code 共用同一個 HTTP 狀態碼，只看狀態碼分不出來
  const pool = [[Code.FailedPrecondition, 'failed_precondition'], [Code.OutOfRange, 'out_of_range'], [Code.Aborted, 'aborted'], [Code.DataLoss, 'data_loss']] as const
  const [code, name] = pool[Math.floor(random() * pool.length)]
  const routes = (router: ConnectRouter) => router.service(InventoryService, { async getStock() { throw new ConnectError('測試用的錯誤', code) } })
  const { url } = await start(http.createServer(connectNodeAdapter({ routes })))
  const res = await fetchStockJson(url, ['1'])
  assert.deepEqual(res, { code: name }, `伺服器丟 ${name}，fetchStockJson 要回傳 { code: '${name}' }，實際：${JSON.stringify(res)}。HTTP 400 可能是 invalid_argument、failed_precondition 或 out_of_range，要讀 body 的 code`)
})

test('只用 fetch：不 import 任何 @connectrpc 的 client 或 transport', opts, () => {
  const src = readFileSync(new URL('./connect-json.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /createClient|createGrpcTransport|createGrpcWebTransport|createConnectTransport|createPromiseClient/,
    'fetchStockJson 要用一般的 fetch 送請求：這一題要證明瀏覽器不需要 gRPC 的 client 也能呼叫（connectNodeAdapter 是伺服器端，可以用）')
  assert.match(src, /fetch\(/, 'fetchStockJson 要用 fetch(…) 送請求')
})
