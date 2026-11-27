import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const opts = { timeout: 15_000 }
const secret = () => 'secret-' + randomBytes(4).toString('hex')

type Ctor = new (...args: any[]) => Error
type Mod = {
  AppError?: Ctor, NotFoundError?: Ctor, ValidationError?: Ctor, ConflictError?: Ctor, UpstreamError?: Ctor,
  toProblem?: (err: unknown, errorId: string) => Record<string, unknown>,
}

async function load() {
  const mod: Mod = await import('./errors.ts')
  for (const k of ['AppError', 'NotFoundError', 'ValidationError', 'ConflictError', 'UpstreamError', 'toProblem'] as const)
    assert.equal(typeof mod[k], 'function', `errors.ts 要 export ${k}`)
  return mod as Required<Mod>
}

test('每個子類別：instanceof、name、code、status、cause 都正確', opts, async () => {
  const m = await load()
  const cause = Object.assign(new Error(secret()), { code: '23505' })
  const cases: [Error, string, string, number][] = [
    [new m.NotFoundError('找不到 42 號訂單', { cause }), 'NotFoundError', 'NOT_FOUND', 404],
    [new m.ValidationError('欄位不對', [{ field: 'qty', message: '要是 1 到 20 的整數' }], { cause }), 'ValidationError', 'VALIDATION', 400],
    [new m.ConflictError('訂單已經存在', { cause }), 'ConflictError', 'CONFLICT', 409],
    [new m.UpstreamError('資料庫逾時', { cause }), 'UpstreamError', 'UPSTREAM_UNAVAILABLE', 503],
  ]
  for (const [err, name, code, status] of cases) {
    const e = err as Error & { code?: unknown, status?: unknown }
    assert.ok(err instanceof m.AppError, `${name} 要繼承 AppError`)
    assert.ok(err instanceof Error, `${name} 要是 Error`)
    assert.equal(Error.isError(err), true, `Error.isError(new ${name}(…)) 要是 true`)
    assert.equal(err.name, name, `new ${name}(…).name 要是 '${name}'，不然 log 和 stack 只會寫 Error，看不出是哪一種錯誤`)
    assert.ok(String(err.stack).startsWith(name), `${name} 的 stack 第一行要以 ${name} 開頭（name 要在建構子裡設好）`)
    assert.equal(e.code, code, `${name} 的 code 要是 '${code}'`)
    assert.equal(e.status, status, `${name} 的 status 要是 ${status}（從 PROBLEMS 查）`)
    assert.equal(err.cause, cause, `${name} 要把 options.cause 保留在 err.cause（傳給 super 的第二個參數）`)
  }
})

test('AppError 照對照表轉成 problem details，4xx 顯示訊息、沒有 errorId', opts, async () => {
  const m = await load()
  const id = randomBytes(8).toString('hex')
  const n = 100 + Math.floor(Math.random() * 900)
  const nf = m.toProblem(new m.NotFoundError(`找不到 ${n} 號訂單`), id)
  assert.deepEqual(nf, { type: 'https://coffee.example/problems/not-found', title: '找不到資源', status: 404, detail: `找不到 ${n} 號訂單` },
    'NotFoundError 要變成 { type, title, status: 404, detail: err.message }，4xx 不要附 errorId')
  const details = [{ field: 'qty', message: '要是 1 到 20 的整數' }, { field: 'drink', message: '不能是空字串' }]
  const v = m.toProblem(new m.ValidationError('欄位不對', details), id)
  assert.deepEqual(v, { type: 'https://coffee.example/problems/validation', title: '資料格式不對', status: 400, detail: '欄位不對', errors: details },
    'ValidationError 要多一個 errors（就是 details）')
  const c = m.toProblem(new m.ConflictError('這筆訂單已經存在', { cause: new Error(secret()) }), id)
  assert.equal(c.status, 409)
  assert.equal(c.type, 'https://coffee.example/problems/conflict')
  assert.equal(c.detail, '這筆訂單已經存在')
  assert.equal(JSON.stringify(c).includes('secret-'), false, 'cause 只給 log 看，不能出現在回應裡')
  const hidden = m.toProblem(new m.AppError('NOT_FOUND', secret(), { expose: false }), id)
  assert.equal(hidden.status, 404)
  assert.equal(JSON.stringify(hidden).includes('secret-'), false, '有給 expose: false 時要照它：detail 用 GENERIC_DETAIL，不顯示訊息（expose 只有「沒給」時才看 4xx／5xx）')
  assert.equal('errorId' in hidden, false, '4xx 不附 errorId')
})

test('5xx 和不認得的東西：一律通用訊息、附 errorId，不帶原始內容', opts, async () => {
  const m = await load()
  const thrown: [string, () => unknown][] = [
    ['TypeError', () => new TypeError(`Cannot read properties of undefined (reading '${secret()}')`)],
    ['UpstreamError（5xx 的 AppError）', () => new m.UpstreamError(`connect ECONNREFUSED ${secret()}`)],
    ['throw 字串', () => secret()],
    ['throw 物件', () => ({ status: 404, code: 'NOT_FOUND', expose: true, message: secret() })],
    ['throw null', () => null],
    ['throw undefined', () => undefined],
    ['throw 數字', () => 42],
  ]
  for (const [what, make] of thrown) {
    const err = make()
    const id = randomBytes(8).toString('hex')
    let p: Record<string, unknown>
    try {
      p = m.toProblem(err, id)
    } catch (e) {
      assert.fail(`${what}：toProblem 自己丟出錯誤（${(e as Error)?.message}）。它是最後一道防線，不能假設收到的是 Error`)
    }
    const upstream = what.startsWith('UpstreamError')
    assert.equal(p.status, upstream ? 503 : 500, `${what} 要回 ${upstream ? 503 : 500}${what === 'throw 物件' ? '：被 throw 的普通物件不是 AppError，不能相信它的 status' : ''}`)
    assert.equal(p.type, `https://coffee.example/problems/${upstream ? 'upstream-unavailable' : 'internal'}`, `${what} 的 type 不對`)
    assert.equal(p.errorId, id, `${what}：5xx 要附 errorId（就是傳進來的第二個參數），客服才能用它到 log 裡找`)
    assert.equal(typeof p.detail, 'string', `${what}：detail 要是字串`)
    assert.equal(typeof p.title, 'string', `${what}：title 要是字串`)
    assert.equal(JSON.stringify(p).includes('secret-'), false, `${what}：回應裡出現了原始訊息。5xx 的 detail 要用 GENERIC_DETAIL，內部細節只寫進 log`)
    assert.equal('errors' in p, false, `${what}：不是 ValidationError 不要有 errors`)
  }
})
