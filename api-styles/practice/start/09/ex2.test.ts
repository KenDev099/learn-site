import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { Code, ConnectError, createClient, type Interceptor } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { deadlineRoutes, getStockWithin, type StockRepo } from './deadline.ts'
import { listen } from '../../helpers/http.ts'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

// 假的下游：永遠不會自己完成，只在收到的 signal abort 時以 signal.reason 失敗。結果只取決於取消有沒有傳下來，跟機器快慢無關
function hangingRepo() {
  const seen: AbortSignal[] = []
  const repo: StockRepo = {
    fetchLevels(_ids, signal) {
      seen.push(signal)
      return new Promise((_, reject) => {
        if (signal?.aborted) return reject(signal.reason)
        signal?.addEventListener('abort', () => reject(signal.reason))
      })
    },
  }
  return { repo, seen }
}

// 送出的 grpc-timeout 標頭：client 設了 timeoutMs，Connect 就會把它放進這個標頭告訴伺服器
async function start(repo: StockRepo, opt: { serverOnlyTimeout?: string } = {}) {
  const sent: (string | null)[] = []
  const record: Interceptor = next => req => {
    if (opt.serverOnlyTimeout) req.header.set('grpc-timeout', opt.serverOnlyTimeout)   // 只告訴伺服器 deadline，client 自己不計時：看得到伺服器回的狀態碼
    sent.push(req.header.get('grpc-timeout'))
    return next(req)
  }
  const { url } = await listen(http2.createServer(connectNodeAdapter({ routes: deadlineRoutes(repo) })))
  return { client: createClient(InventoryService, createGrpcTransport({ baseUrl: url, interceptors: [record] })), sent }
}

async function within<T>(p: Promise<T>, ms: number, msg: string) {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms) })])
  } finally {
    clearTimeout(timer)
  }
}
async function errorOf(p: Promise<unknown>, ms: number, msg: string) {
  try {
    await within(p, ms, msg)
  } catch (e) {
    if (e instanceof Error && e.message === msg) throw e
    return ConnectError.from(e)
  }
  assert.fail('呼叫應該失敗，卻成功了')
}
async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise(r => setTimeout(r, 10))
  return check()
}

test('正常情況：getStockWithin 用 budgetMs 當 deadline，回傳 repo 查到的庫存', opts, async () => {
  const ids = shuffle(PRODUCTS, random).slice(0, 3).map(p => p.id)
  const levels = new Map(ids.map(id => [id, Math.floor(random() * 40)]))
  const signals: { signal: AbortSignal, abortedAtCall: boolean }[] = []
  const repo: StockRepo = { async fetchLevels(_ids, signal) { signals.push({ signal, abortedAtCall: signal?.aborted }); return levels } }
  const { client, sent } = await start(repo)
  const budget = 1500 + Math.floor(random() * 1000)
  const res = await within(getStockWithin(client, ids, budget), 5000, '呼叫沒有回應')
  for (const id of ids) assert.equal(res.levels[id]?.available, levels.get(id), `商品 ${id} 的 available 要是 repo 回傳的數字`)
  assert.equal(sent[0], `${budget}m`, `client 要用 { timeoutMs: budgetMs } 呼叫（grpc-timeout 標頭應該是 ${budget}m，實際是 ${sent[0]}）`)
  assert.ok(signals[0]?.signal instanceof AbortSignal && !signals[0].abortedAtCall, 'repo 要收到一個還沒 abort 的 AbortSignal')
})

test('client 的 deadline 到了：client 收到 DEADLINE_EXCEEDED，repo 的 signal 也跟著 abort', opts, async () => {
  const { repo, seen } = hangingRepo()
  const { client } = await start(repo)
  const err = await errorOf(getStockWithin(client, ['2'], 100), 3000,
    '等了 3 秒都沒有結果：getStockWithin 要用 client.getStock(請求, { timeoutMs: budgetMs }) 設 deadline，沒設就會永遠等下去')
  assert.equal(Code[err.code], 'DeadlineExceeded', `client 應該收到 DeadlineExceeded，實際是 ${Code[err.code]}`)
  assert.equal(seen.length, 1, 'repo 應該被呼叫一次')
  const aborted = await waitFor(() => seen[0]?.aborted === true)
  assert.ok(aborted, 'client 放棄之後，repo 收到的 signal 一直沒有 abort：呼叫 repo.fetchLevels 時要傳 ctx.signal，取消才會傳下去')
  const reason = seen[0].reason
  assert.ok(reason instanceof ConnectError,
    `repo 的 signal 應該因為這次 RPC 結束而 abort（reason 是 Connect 的 ConnectError），實際的 reason 是 ${reason}。不要自己用 AbortSignal.timeout 訂固定的逾時，要用 ctx.signal`)
})

test('伺服器的 deadline 到了：回 DEADLINE_EXCEEDED，不是 INTERNAL', opts, async () => {
  const { repo, seen } = hangingRepo()
  const { client } = await start(repo, { serverOnlyTimeout: '150m' })
  const err = await errorOf(client.getStock({ productIds: ['1'] }), 3000,
    '伺服器的 deadline（150 ms）過了 3 秒還沒回應：要把 ctx.signal 傳給 repo，deadline 到時 repo 才會停')
  assert.equal(seen.length, 1, 'repo 應該被呼叫一次')
  assert.equal(Code[err.code], 'DeadlineExceeded', `伺服器應該回 DeadlineExceeded，實際是 ${Code[err.code]}（${err.rawMessage}）：repo 以 signal.reason 失敗時讓錯誤原樣往外丟，不要包成 Internal`)
})

test(`剩餘時間不到 20 ms：直接回 DEADLINE_EXCEEDED，不呼叫 repo`, opts, async () => {
  for (const left of ['15m', '5m']) {
    const { repo, seen } = hangingRepo()
    const { client } = await start(repo, { serverOnlyTimeout: left })
    const err = await errorOf(client.getStock({ productIds: ['3'] }), 3000, '伺服器一直沒有回應：剩餘時間不夠時要立刻丟錯，不要呼叫 repo')
    assert.equal(seen.length, 0, `剩 ${left.replace('m', ' ms')} 時不應該呼叫 repo：先看 ctx.timeoutMs()，小於 MIN_BUDGET_MS 就丟錯`)
    assert.equal(Code[err.code], 'DeadlineExceeded', `剩餘時間不夠時要丟 Code.DeadlineExceeded，實際是 ${Code[err.code]}`)
  }
})
