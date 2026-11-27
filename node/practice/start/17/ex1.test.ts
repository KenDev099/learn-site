import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { listen } from '../../helpers/http.ts'
import * as errors from './errors.ts'

const opts = { timeout: 15_000 }
type GetStock = (baseUrl: string, productId: number, o?: { signal?: AbortSignal, timeoutMs?: number }) => Promise<{ productId: number, stock: number }>

async function load() {
  const mod: { getStock?: unknown } = await import('./supplier.ts')
  assert.equal(typeof mod.getStock, 'function', 'supplier.ts 要 export async function getStock(baseUrl, productId, options)')
  return mod.getStock as GetStock
}

// 假上游：每個請求交給 handle 決定怎麼回；記下收到的請求和每條連線何時關閉
async function upstream(handle: (req: IncomingMessage, res: ServerResponse) => void) {
  const seen: string[] = []
  const closed: number[] = []
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    res.on('close', () => closed.push(Date.now()))
    handle(req, res)
  })
  const { url } = await listen(server)
  return { url, seen, closed }
}

// 等 promise 結果，順便量時間；最多等 limitMs，超過就判錯（不讓測試卡住）
async function settle<T>(p: Promise<T>, limitMs: number) {
  const t0 = Date.now()
  let timer: NodeJS.Timeout | undefined
  const guard = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`getStock 過了 ${limitMs}ms 還沒有結果`)), limitMs) })
  try {
    const value = await Promise.race([p, guard])
    return { ok: true as const, value, ms: Date.now() - t0 }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('getStock 過了')) throw error
    return { ok: false as const, error, ms: Date.now() - t0 }
  } finally { clearTimeout(timer) }
}

const rand = (n: number) => Math.floor(Math.random() * n)

test('正常回應：GET /stock/:id，回傳 { productId, stock }', opts, async () => {
  const getStock = await load()
  const id = 1 + rand(6), stock = rand(50)
  const up = await upstream((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ productId: id, stock })) })
  const r = await settle(getStock(up.url, id), 3000)
  assert.ok(r.ok, `正常回應不該失敗：${r.ok ? '' : String(r.error)}`)
  assert.deepEqual(r.value, { productId: id, stock }, '回傳上游給的庫存')
  assert.deepEqual(up.seen, [`GET /stock/${id}`], '要用 GET 呼叫 /stock/:id，而且只呼叫一次')
})

test('上游太慢：逾時丟 UpstreamTimeoutError（預設 1 秒，也可以用 timeoutMs 指定）', opts, async () => {
  const getStock = await load()
  const up = await upstream((req, res) => { setTimeout(() => res.end('{"stock":1}'), 3000) })
  const r = await settle(getStock(up.url, 2), 2500)
  assert.ok(!r.ok, '上游 3 秒才回應，預設 1 秒就要放棄：fetch 本身沒有整體逾時，要用 AbortSignal.timeout')
  assert.ok(r.error instanceof errors.UpstreamTimeoutError, `逾時要丟 UpstreamTimeoutError（收到 ${String(r.error)}）`)
  assert.ok(r.ms >= 900 && r.ms < 1800, `預設逾時是 1000ms（實際 ${r.ms}ms）`)
  const r2 = await settle(getStock(up.url, 2, { timeoutMs: 300 }), 2500)
  assert.ok(!r2.ok && r2.error instanceof errors.UpstreamTimeoutError, 'timeoutMs: 300 也要丟 UpstreamTimeoutError')
  assert.ok(r2.ms >= 250 && r2.ms < 900, `timeoutMs: 300 要在 300ms 左右放棄（實際 ${r2.ms}ms），不能寫死 1000`)
  await new Promise(res => setTimeout(res, 150))
  assert.equal(up.closed.length, 2, '逾時之後要真的取消請求、關掉連線：把 AbortSignal.timeout 傳給 fetch 的 signal，不要只用 Promise.race 先丟錯（fetch 會在背後繼續等）')
})

test('非 2xx：丟 UpstreamHttpError（含 status、Retry-After），不讀 body、取消它讓連線釋放', opts, async () => {
  const getStock = await load()
  // 4xx 和 5xx 各挑一個：只檢查 status >= 500 的寫法會把 404 當成功
  for (const status of [[404, 429][rand(2)], [500, 502, 503][rand(3)]]) {
    const retryAfter = String(1 + rand(9))
    // 錯誤的 body 一直不結束：讀 body 的寫法會卡到逾時；沒取消 body 的話連線會一直開著
    const up = await upstream((req, res) => {
      if (req.url === '/stock/9') { res.end('{"stock":9}'); return }
      res.writeHead(status, { 'retry-after': retryAfter, 'content-type': 'text/plain' })
      res.write('upstream is sad…')
    })
    const r = await settle(getStock(up.url, 3), 3000)
    assert.ok(!r.ok, `上游回 ${status}，不能當成成功：fetch 對 4xx／5xx 不會 throw，要自己看 res.ok`)
    assert.ok(r.error instanceof errors.UpstreamHttpError, `上游回 ${status} 要丟 UpstreamHttpError（收到 ${String(r.error)}）：用 !res.ok 判斷所有非 2xx；錯誤的 body 不要讀，直接 await res.body?.cancel()`)
    assert.equal(r.error.status, status, 'UpstreamHttpError 要帶上游的 status')
    assert.equal(r.error.retryAfter, retryAfter, '把 Retry-After 標頭的值傳給 UpstreamHttpError（第 2 個參數），練習 2 會用到')
    assert.ok(r.ms < 800, `收到標頭就該判斷失敗，不要等 body（花了 ${r.ms}ms）`)
    await new Promise(res => setTimeout(res, 300))
    assert.equal(up.closed.length, 1, '丟錯之前要 await res.body?.cancel()：不讀也不取消 body，這條連線會一直被占著，不會回到連線池')
    const ok = await settle(getStock(up.url, 9), 3000)
    assert.ok(ok.ok, '出錯之後，下一個請求要能正常完成')
  }
})

test('格式不對：丟 UpstreamBadResponseError', opts, async () => {
  const getStock = await load()
  const bodies = ['{"stock":"many"}', '{"stock":-1}', '{"stock":2.5}', '{"productId":1}', 'null', '[]', '<html>維修中</html>']
  let i = 0
  const up = await upstream((req, res) => { res.end(bodies[i++]) })
  for (const body of bodies) {
    const r = await settle(getStock(up.url, 1), 3000)
    assert.ok(!r.ok, `上游回 ${body} 時不能回傳成功：外部資料要驗證，stock 必須是 ≥ 0 的整數`)
    assert.ok(r.error instanceof errors.UpstreamBadResponseError, `上游回 ${body} 要丟 UpstreamBadResponseError（收到 ${String(r.error)}）`)
  }
})

test('連不上：丟 UpstreamUnavailableError，cause 保留 fetch 的原始錯誤', opts, async () => {
  const getStock = await load()
  const s = createServer()
  const { url, close } = await listen(s)
  await close()                       // 這個 port 現在沒有人在聽
  const r = await settle(getStock(url, 1), 3000)
  assert.ok(!r.ok, '連不上要丟錯')
  assert.ok(r.error instanceof errors.UpstreamUnavailableError, `連不上要丟 UpstreamUnavailableError（收到 ${String(r.error)}）`)
  const cause = r.error.cause as { message?: string, cause?: { code?: string } } | undefined
  assert.equal(cause?.cause?.code, 'ECONNREFUSED', '把 fetch 丟出的原始錯誤（TypeError: fetch failed）放進 { cause }：真正的原因 ECONNREFUSED 在它的 cause 裡，log 才查得到')
})

test('呼叫端的 signal 取消：立刻停，原樣丟出 AbortError，不包成上游錯誤', opts, async () => {
  const getStock = await load()
  const up = await upstream((req, res) => { setTimeout(() => res.end('{"stock":1}'), 3000) })
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 100)
  const r = await settle(getStock(up.url, 4, { signal: ac.signal, timeoutMs: 2000 }), 3000)
  assert.ok(!r.ok, '呼叫端取消了就要 reject')
  assert.ok(r.ms < 500, `呼叫端在 100ms 取消，要馬上停，不是等到逾時（花了 ${r.ms}ms）：用 AbortSignal.any 合併呼叫端的 signal 和逾時`)
  assert.equal((r.error as Error).name, 'AbortError', '呼叫端取消要原樣丟出 AbortError（signal.reason）')
  assert.ok(!(r.error instanceof errors.UpstreamError), '呼叫端自己取消不是上游的錯，不要包成 UpstreamTimeoutError 或其他 Upstream 錯誤')
  await new Promise(res => setTimeout(res, 100))
  assert.equal(up.closed.length, 1, '取消之後上游的連線要被關掉')
})

test('呼叫端傳的 signal 本身是 AbortSignal.timeout：還是呼叫端取消，原樣丟出它的 reason', opts, async () => {
  const getStock = await load()
  const up = await upstream((req, res) => { setTimeout(() => res.end('{"stock":1}'), 3000) })
  const r = await settle(getStock(up.url, 5, { signal: AbortSignal.timeout(150), timeoutMs: 2000 }), 3000)
  assert.ok(!r.ok, '呼叫端的 signal 到期了就要 reject')
  assert.ok(r.ms < 600, `呼叫端的 signal 150ms 就到期，要馬上停（花了 ${r.ms}ms）`)
  assert.ok(!(r.error instanceof errors.UpstreamError),
    `是呼叫端的 signal 先到期，不是我們的 2 秒逾時：要原樣丟出 signal.reason，不能包成 Upstream 錯誤（收到 ${String(r.error)}）。判斷方式是看呼叫端的 signal.aborted，不是看 err.name`)
  assert.equal((r.error as Error).name, 'TimeoutError', '原樣丟出呼叫端 signal 的 reason（這裡是 TimeoutError）')
})
