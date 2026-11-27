import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { listen } from '../../helpers/http.ts'
import * as errors from './errors.ts'

const opts = { timeout: 15_000 }
type Opts = { retries: number, baseMs: number, maxMs: number, deadlineMs: number, random?: () => number }
type WithRetry = <T>(fn: () => Promise<T>, o: Opts) => Promise<T>

async function load() {
  const mod: { withRetry?: unknown, getStockWithRetry?: unknown } = await import('./retry.ts')
  assert.equal(typeof mod.withRetry, 'function', 'retry.ts 要 export async function withRetry(fn, options)')
  return { withRetry: mod.withRetry as WithRetry, getStockWithRetry: mod.getStockWithRetry as (u: string, id: number) => Promise<unknown> }
}

// 依序丟出 failures 裡的錯誤，之後回傳 'ok'；記下每次被呼叫的時間
function flaky(failures: unknown[]) {
  const calls: number[] = []
  const fn = async () => {
    calls.push(Date.now())
    if (calls.length <= failures.length) throw failures[calls.length - 1]
    return 'ok'
  }
  return { fn, calls, gaps: () => calls.slice(1).map((t, i) => t - calls[i]) }
}
const always = (make: () => unknown) => {
  const calls: number[] = []
  const errs: unknown[] = []
  const fn = async (): Promise<string> => { calls.push(Date.now()); const e = make(); errs.push(e); throw e }
  return { fn, calls, errs, gaps: () => calls.slice(1).map((t, i) => t - calls[i]) }
}
const fast: Opts = { retries: 3, baseMs: 100, maxMs: 1000, deadlineMs: 5000, random: () => 0 }

async function rejects(p: Promise<unknown>) {
  try { await p } catch (e) { return e }
  assert.fail('應該要 reject，卻成功了')
}

test('暫時性的失敗會重試：503、503 之後成功', opts, async () => {
  const { withRetry } = await load()
  const f = flaky([new errors.UpstreamHttpError(503), new errors.UpstreamHttpError(503)])
  assert.equal(await withRetry(f.fn, fast), 'ok', '重試之後成功，要回傳 fn 的結果')
  assert.equal(f.calls.length, 3, '失敗兩次、第三次成功，fn 要被呼叫 3 次')
})

test('會重試的錯誤：429、502、503、504、連不上、逾時', opts, async () => {
  const { withRetry } = await load()
  const cases: [string, unknown][] = [
    ['429', new errors.UpstreamHttpError(429)], ['502', new errors.UpstreamHttpError(502)],
    ['503', new errors.UpstreamHttpError(503)], ['504', new errors.UpstreamHttpError(504)],
    ['UpstreamUnavailableError', new errors.UpstreamUnavailableError('down')],
    ['UpstreamTimeoutError', new errors.UpstreamTimeoutError('slow')],
  ]
  for (const [label, err] of cases) {
    const f = flaky([err])
    assert.equal(await withRetry(f.fn, fast), 'ok', `${label} 是暫時性的失敗，要重試`)
    assert.equal(f.calls.length, 2, `${label}：失敗一次、重試一次`)
  }
})

test('不會重試的錯誤：400、401、404、422、格式不對、呼叫端取消、程式錯誤，原樣丟出', opts, async () => {
  const { withRetry } = await load()
  const abort = new DOMException('This operation was aborted', 'AbortError')
  const cases: [string, unknown][] = [
    ['400', new errors.UpstreamHttpError(400)], ['401', new errors.UpstreamHttpError(401)],
    ['404', new errors.UpstreamHttpError(404)], ['422', new errors.UpstreamHttpError(422)],
    ['UpstreamBadResponseError', new errors.UpstreamBadResponseError('bad')],
    ['AbortError', abort], ['TypeError', new TypeError('x is not a function')],
  ]
  for (const [label, err] of cases) {
    const f = flaky([err])
    const got = await rejects(withRetry(f.fn, fast))
    assert.equal(f.calls.length, 1, `${label} 再試幾次結果都一樣，不能重試`)
    assert.equal(got, err, `${label}：要原樣丟出 fn 的錯誤`)
  }
})

test('次數用完就丟出最後一個錯誤', opts, async () => {
  const { withRetry } = await load()
  const retries = 2 + Math.floor(Math.random() * 3)
  const a = always(() => new errors.UpstreamHttpError(503))
  const got = await rejects(withRetry(a.fn, { ...fast, retries }))
  assert.equal(a.calls.length, retries + 1, `retries: ${retries} 代表第一次之外最多再試 ${retries} 次，總共 ${retries + 1} 次`)
  assert.equal(got, a.errs.at(-1), '要丟出最後一次的錯誤')
})

// 下面三個測試用假時鐘（mock.timers）：setTimeout 和 Date.now() 由測試控制，量到的等待時間每次都一樣
// 所以 withRetry 裡算時間要用 Date.now()，等待要用全域的 setTimeout：await new Promise(r => setTimeout(r, ms))
type MockT = { mock: { timers: { enable(o: { apis: ('setTimeout' | 'Date')[] }): void, runAll(): void } } }
async function drive<T>(t: MockT, p: Promise<T>) {
  let done = false
  const q = p.finally(() => { done = true })
  q.catch(() => {})
  for (let i = 0; !done; i++) {
    assert.ok(i < 1000, 'withRetry 一直沒有結束：檢查次數上限和截止時間')
    await new Promise(r => setImmediate(r))   // 讓 withRetry 跑到下一個 await
    t.mock.timers.runAll()                    // 假時鐘直接跳到計時器到期
  }
  return q
}

test('等待時間：指數退避加 full jitter，random() × min(maxMs, baseMs × 2^n)', opts, async t => {
  const { withRetry } = await load()
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const check = async (r: number, expected: number[]) => {
    const a = always(() => new errors.UpstreamHttpError(503))
    await rejects(drive(t, withRetry(a.fn, { retries: 4, baseMs: 100, maxMs: 300, deadlineMs: 10_000, random: () => r })))
    const gaps = a.gaps()
    assert.equal(gaps.length, 4, 'retries: 4 要重試 4 次')
    gaps.forEach((g, n) => {
      assert.ok(Math.abs(g - expected[n]) <= 1,
        `random() 回 ${r} 時，第 ${n + 1} 次重試前要等 ${r} × min(300, 100 × 2^${n}) = ${expected[n]}ms（實際 ${g}ms）：先用 min 取上限，再乘 random()。測試用假時鐘控制全域的 setTimeout 和 Date.now()，等待請寫 await new Promise(r => setTimeout(r, ms))`)
    })
  }
  await check(1, [100, 200, 300, 300])    // 300 是 maxMs 的上限
  await check(0.5, [50, 100, 150, 150])   // 先取上限再乘 random：min(300, 100 × 2^3) = 300，× 0.5 = 150
  await check(0, [0, 0, 0, 0])
})

test('Retry-After：429／503 帶 Retry-After 秒數時，至少等那麼久', opts, async t => {
  const { withRetry } = await load()
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  for (const status of [429, 503]) {
    const f = flaky([new errors.UpstreamHttpError(status, '1')])
    assert.equal(await drive(t, withRetry(f.fn, fast)), 'ok', `${status} 帶 Retry-After 也要重試`)
    const [gap] = f.gaps()
    assert.ok(gap >= 1000, `上游回 ${status}、Retry-After: 1，至少要等 1 秒再試，Retry-After 的單位是秒（實際 ${gap}ms）`)
    assert.ok(gap <= 1001, `Retry-After: 1 等 1 秒就好，取「退避時間」和 Retry-After 較大的那個（實際 ${gap}ms）`)
  }
})

test('截止時間：等下去會超過 deadlineMs 就不再等，丟出最後一個錯誤', opts, async t => {
  const { withRetry } = await load()
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const a = always(() => new errors.UpstreamHttpError(503))
  const got = await rejects(drive(t, withRetry(a.fn, { retries: 20, baseMs: 100, maxMs: 100, deadlineMs: 350, random: () => 1 })))
  assert.equal(a.calls.length, 4, `每次等 100ms、整件事最多 350ms：在 0、100、200、300ms 呼叫，再等 100ms 就超過，所以總共 4 次（實際 ${a.calls.length} 次）。從第一次呼叫開始用 Date.now() 算`)
  assert.equal(got, a.errs.at(-1), '要丟出最後一次的錯誤')

  const b = always(() => new errors.UpstreamHttpError(503, '5'))
  const t1 = Date.now()
  await rejects(drive(t, withRetry(b.fn, { ...fast, deadlineMs: 2000 })))
  assert.equal(b.calls.length, 1, 'Retry-After: 5 已經超過 2 秒的截止時間，不要等，直接丟出錯誤')
  assert.equal(Date.now() - t1, 0, '等了也來不及，就不要等')
})

test('getStockWithRetry：用 withRetry 包 getStock，上游 503、503、200 → 成功；404 → 只呼叫一次', opts, async () => {
  const { getStockWithRetry } = await load()
  assert.equal(typeof getStockWithRetry, 'function', 'retry.ts 要 export getStockWithRetry(baseUrl, productId)')
  const stock = Math.floor(Math.random() * 40)
  const hits = new Map<string, number>()
  const server = createServer((req, res) => {
    const n = (hits.get(req.url!) ?? 0) + 1
    hits.set(req.url!, n)
    if (req.url === '/stock/5' && n <= 2) { res.writeHead(503).end(); return }
    if (req.url === '/stock/5') { res.end(JSON.stringify({ productId: 5, stock })); return }
    res.writeHead(404).end()
  })
  const { url } = await listen(server)
  let value: unknown
  try { value = await getStockWithRetry(url, 5) } catch (e) {
    assert.fail(`上游前兩次 503、第三次成功，要重試到成功（收到 ${String(e)}）。練習 1 的 getStock 要先完成`)
  }
  assert.deepEqual(value, { productId: 5, stock })
  assert.equal(hits.get('/stock/5'), 3, '上游要收到 3 次請求')
  const err = await rejects(getStockWithRetry(url, 6))
  assert.ok(err instanceof errors.UpstreamHttpError && err.status === 404, '404 要丟 UpstreamHttpError')
  assert.equal(hits.get('/stock/6'), 1, '404 不重試，上游只收到 1 次')
})
