import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { createSchema, createYoga } from 'graphql-yoga'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { createClient, type ConnectRouter, type Interceptor } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { callerOf, downstreamOptions, type RequestCtx } from './metadata.ts'
import { listen } from '../../helpers/http.ts'
import { gql } from '../../helpers/graphql.ts'
import { mulberry32 } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const rid = () => Math.floor(random() * 1e12).toString(36)
const show = (v: unknown) => JSON.stringify(v)

type Seen = { caller: ReturnType<typeof callerOf>, cookie: string | null, tracking: string | null }

// 庫存服務：每次 getStock 都用你的 callerOf 讀出呼叫者，也記下原始標頭（看有沒有不該轉送的）
// BFF：一個 GraphQL 請求裡呼叫兩次庫存服務（a 與 b 兩個欄位），每次都用 downstreamOptions
async function start(budget: number) {
  const seen: Seen[] = []
  const routes = (router: ConnectRouter) => router.service(InventoryService, {
    async getStock(req, ctx) {
      seen.push({ caller: callerOf(ctx), cookie: ctx.requestHeader.get('cookie'), tracking: ctx.requestHeader.get('x-tracking') })
      return { levels: { [req.productIds[0]]: { productId: req.productIds[0], available: 3 } } }
    },
  })
  const sentTimeouts: (string | null)[] = []
  const record: Interceptor = next => req => { sentTimeouts.push(req.header.get('grpc-timeout')); return next(req) }
  const { url } = await listen(http2.createServer(connectNodeAdapter({ routes })))
  const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: url, interceptors: [record] }))
  const t0 = 1_700_000_000_000 + Math.floor(random() * 1e9)
  const now = () => t0
  const generated: string[] = []
  const newId = () => { const id = `gen-${rid()}`; generated.push(id); return id }
  const call = async (id: string, ctx: RequestCtx) => (await inventory.getStock({ productIds: [id] }, downstreamOptions(ctx, now))).levels[id].available
  const yoga = createYoga<{}, RequestCtx>({
    schema: createSchema<RequestCtx>({
      typeDefs: 'type Query { a: Int  b: Int }',
      resolvers: { Query: { a: (_p: unknown, _a: unknown, ctx: RequestCtx) => call('1', ctx), b: (_p: unknown, _a: unknown, ctx: RequestCtx) => call('2', ctx) } },
    }),
    context: ({ request }) => ({ headers: request.headers, deadline: t0 + budget, newId }),
    logging: false,
  })
  return { yoga, seen, sentTimeouts, generated }
}

async function ask(yoga: Awaited<ReturnType<typeof start>>['yoga'], headers: Record<string, string> = {}) {
  const { body } = await gql(yoga, '{ a b }', undefined, headers)
  assert.equal(body.errors, undefined, `BFF 呼叫庫存服務失敗（把進來的標頭整包轉送會連 content-type、content-length 一起送出，gRPC 請求就壞了；headers 只放要轉送的那幾個）：${show(body.errors)}`)
  assert.deepEqual(body.data, { a: 3, b: 3 })
}

test('客戶端帶了 x-request-id：兩次下游呼叫都帶同一個 id；庫存服務用 callerOf 讀得到', opts, async () => {
  const { yoga, seen, generated } = await start(800)
  const id = `req-${rid()}`
  await ask(yoga, { 'x-request-id': id })
  assert.equal(seen.length, 2)
  for (const s of seen) {
    assert.equal(s.caller.requestId, id, `庫存服務要收到 x-request-id: ${id}（沿用進來的請求標頭），callerOf 讀到的是 ${s.caller.requestId}。` +
      'downstreamOptions 回傳 { headers: { "x-request-id": … } }；callerOf 用 ctx.requestHeader.get("x-request-id")')
  }
  assert.equal(generated.length, 0, '客戶端已經帶了 x-request-id，不要再產生新的')
})

test('客戶端沒帶 x-request-id：同一個請求只產生一次、兩次下游共用；不同請求的 id 不同', opts, async () => {
  const { yoga, seen, generated } = await start(800)
  await ask(yoga)
  await ask(yoga)
  assert.equal(generated.length, 2, `兩個 GraphQL 請求應該剛好呼叫 newId() 兩次（每個請求一次），實際 ${generated.length} 次。把產生的 id 存進 ctx.requestId，同一個請求的下一次呼叫沿用`)
  assert.deepEqual(seen.map(s => s.caller.requestId), [generated[0], generated[0], generated[1], generated[1]],
    `第一個請求的兩次下游呼叫都要帶 ${generated[0]}，第二個請求都帶 ${generated[1]}，實際：${show(seen.map(s => s.caller.requestId))}`)
})

test('authorization 原樣轉送；cookie 與其他標頭不轉送', opts, async () => {
  const { yoga, seen } = await start(800)
  const token = `Bearer ${rid()}.${rid()}`
  await ask(yoga, { authorization: token, cookie: `session=${rid()}`, 'x-tracking': rid() })
  for (const s of seen) {
    assert.equal(s.caller.hasAuth, true, '庫存服務要收到 authorization（callerOf 的 hasAuth 用 ctx.requestHeader.has("authorization")）')
    assert.equal(s.cookie, null, 'cookie 被轉送到內部服務了：只轉送 x-request-id 與 authorization，其他標頭一律不帶（白名單）')
    assert.equal(s.tracking, null, 'x-tracking 也被轉送了：只轉送 x-request-id 與 authorization')
  }
  const { yoga: y2, seen: s2 } = await start(800)
  await ask(y2)
  assert.equal(s2[0].caller.hasAuth, false, '客戶端沒帶 authorization 時，不要送出空的 authorization 標頭')
})

test('timeoutMs 依剩餘預算計算：deadline − now() − 20', opts, async () => {
  const budget = 300 + Math.floor(random() * 900)
  const { yoga, sentTimeouts } = await start(budget)
  await ask(yoga)
  assert.deepEqual(sentTimeouts, [`${budget - 20}m`, `${budget - 20}m`],
    `剩餘預算 ${budget} ms，timeoutMs 要是 ${budget - 20}（ctx.deadline − now() − MIN_BUDGET_MS，用傳進來的 now），實際送出的 grpc-timeout：${show(sentTimeouts)}`)
})
