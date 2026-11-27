import test from 'node:test'
import assert from 'node:assert/strict'

const opts = { timeout: 15_000 }
const hex = () => Math.random().toString(16).slice(2, 10)
type Entry = Record<string, any>
type LogFn = (msg: string, fields?: Record<string, unknown>) => void
type Logger = { debug: LogFn, info: LogFn, warn: LogFn, error: LogFn, fatal: LogFn, child(b: Record<string, unknown>): Logger }
const LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const

// 建一個 logger，把輸出的每一行收起來
async function setup(options: { level?: string } = {}) {
  const mod: { createLogger?: unknown } = await import('./logger.ts')
  assert.equal(typeof mod.createLogger, 'function', 'logger.ts 要 export function createLogger(options)')
  const lines: string[] = []
  const now = new Date(Date.UTC(2026, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28), 8, 30))
  const logger = (mod.createLogger as (o: object) => Logger)({ ...options, now: () => now, write: (line: string) => { lines.push(line) } })
  const entries = () => lines.map((line, i) => {
    assert.ok(line.endsWith('\n') && line.indexOf('\n') === line.length - 1, `第 ${i + 1} 次 write 要剛好是一行，結尾一個 \\n：${JSON.stringify(line).slice(0, 200)}`)
    try { return JSON.parse(line) as Entry } catch { assert.fail(`第 ${i + 1} 行不是合法的 JSON：${line.slice(0, 200)}`) }
  })
  return { logger, lines, entries, now }
}

// 叫 logger 寫一行，回傳解析後的物件；logger 本身丟錯就判錯
function one(env: Awaited<ReturnType<typeof setup>>, call: () => void, what: string): Entry {
  const before = env.lines.length
  try { call() } catch (err) { assert.fail(`${what}：logger 自己丟出錯誤（${(err as Error).message.split('\n')[0]}），log 不能讓程式出錯`) }
  assert.equal(env.lines.length, before + 1, `${what}：要剛好輸出一行`)
  return env.entries().at(-1)!
}

test('一行一個 JSON：time（ISO 字串）、level、msg 在最前面，後面接欄位', opts, async () => {
  const env = await setup()
  const id = hex()
  const e = one(env, () => env.logger.info('訂單成立', { orderId: id, total: 190 }), 'info')
  assert.deepEqual(Object.keys(e).slice(0, 3), ['time', 'level', 'msg'], '欄位順序：time、level、msg，然後才是其他欄位')
  assert.equal(e.time, env.now.toISOString(), 'time 要用 now() 的 toISOString()')
  assert.equal(e.level, 'info')
  assert.equal(e.msg, '訂單成立')
  assert.equal(e.orderId, id, '欄位要原樣放進 log')
  assert.equal(e.total, 190)
  const w = one(env, () => env.logger.warn('第二行\n有換行'), 'warn')
  assert.equal(w.msg, '第二行\n有換行', '訊息裡的換行要被 JSON 跳脫，不能真的換行')
})

test('等級過濾：低於設定等級的不輸出，預設是 info', opts, async () => {
  const def = await setup()
  for (const lv of LEVELS) def.logger[lv]('x')
  assert.deepEqual(def.entries().map(e => e.level), ['info', 'warn', 'error', 'fatal'], '沒設定 level 時預設 info：debug 不輸出')
  for (const [i, level] of LEVELS.entries()) {
    const env = await setup({ level })
    for (const lv of LEVELS) env.logger[lv]('x')
    assert.deepEqual(env.entries().map(e => e.level), LEVELS.slice(i), `level 設成 ${level} 時，只輸出 ${LEVELS.slice(i).join('、')}`)
  }
})

test('child：自動附加共同欄位，可以一層層疊加，不影響父 logger', opts, async () => {
  const env = await setup({ level: 'debug' })
  const shop = hex(), req = hex()
  const a = env.logger.child({ service: 'orders', shop })
  const b = a.child({ requestId: req })
  assert.equal(typeof b.debug, 'function', 'child 要回傳一個 logger')
  const e1 = one(env, () => b.debug('查詢', { sql: 'SELECT 1' }), 'child 的 child')
  assert.equal(e1.shop, shop, 'child 的 child 要保留第一層的欄位')
  assert.equal(e1.service, 'orders')
  assert.equal(e1.requestId, req, '要附上第二層的欄位')
  assert.equal(e1.sql, 'SELECT 1')
  assert.equal(e1.level, 'debug', 'child 沿用父 logger 的等級設定')
  const e2 = one(env, () => a.info('a'), '第一層 child')
  assert.equal(e2.requestId, undefined, '建立 child 的 child 不能改到第一層')
  const e3 = one(env, () => env.logger.info('root'), '父 logger')
  assert.equal(e3.shop, undefined, '建立 child 不能改到父 logger')
})

test('Error 序列化成 { name, message, stack, code, cause }，cause 一路往下', opts, async () => {
  const env = await setup()
  const port = 5000 + Math.floor(Math.random() * 999)
  const root = Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:${port}`), { code: 'ECONNREFUSED' })
  const mid = new TypeError('查庫存失敗', { cause: root })
  const top = new Error(`建立訂單失敗 ${port}`, { cause: mid })
  const e = one(env, () => env.logger.error('建立訂單失敗', { err: top }), 'error')
  assert.equal(typeof e.err, 'object', 'err 要是物件')
  assert.notDeepEqual(e.err, {}, 'err 變成 {} 了：Error 的 message、stack 不可列舉，JSON.stringify 不會輸出，要自己轉')
  assert.equal(e.err.name, 'Error')
  assert.equal(e.err.message, `建立訂單失敗 ${port}`)
  assert.ok(typeof e.err.stack === 'string' && e.err.stack.includes('建立訂單失敗'), 'err.stack 要是字串')
  assert.equal(e.err.cause?.name, 'TypeError', 'cause 也要序列化（name）')
  assert.equal(e.err.cause?.message, '查庫存失敗')
  assert.equal(e.err.cause?.cause?.message, `connect ECONNREFUSED 127.0.0.1:${port}`, 'cause 的 cause 也要序列化：沿著 cause 一路走完')
  assert.equal(e.err.cause?.cause?.code, 'ECONNREFUSED', '有 code 的錯誤要帶上 code')
  assert.equal('code' in e.err, false, '沒有 code 的錯誤不用加 code')
  const deep = one(env, () => env.logger.warn('重試', { attempt: { n: 2, err: new RangeError('太慢') }, errors: [new Error('第一次')] }), '巢狀的 Error')
  assert.equal(deep.attempt?.err?.message, '太慢', '物件裡面的 Error 也要序列化')
  assert.equal(deep.errors?.[0]?.message, '第一次', '陣列裡的 Error 也要序列化')
  const s = one(env, () => env.logger.error('x', { err: new Error('外層', { cause: '純文字原因' }) }), 'cause 是字串')
  assert.equal(s.err.cause, '純文字原因', 'cause 不是 Error 時照原樣輸出')
})

test('遮蔽：password、token、authorization、cookie、cardNumber（不分大小寫、任何深度、陣列裡）', opts, async () => {
  const env = await setup()
  const secrets = Array.from({ length: 8 }, () => 'S3CRET-' + hex())
  const user = hex()
  const bindings = { token: secrets[0] }
  const fields = {
    user,
    password: secrets[1],
    headers: { Authorization: 'Bearer ' + secrets[2], Cookie: 'sid=' + secrets[3], accept: 'application/json' },
    payment: { method: 'card', CardNumber: secrets[4] },
    accounts: [{ name: 'a', PASSWORD: secrets[5] }, { name: 'b', nested: [{ token: secrets[6] }] }],
    note: '密碼長度 8',
  }
  const before = structuredClone({ bindings, fields })
  const e = one(env, () => env.logger.child(bindings).info('登入', fields), '有敏感欄位的 log')
  assert.deepEqual({ bindings, fields }, before, '遮蔽只改輸出，不能改到呼叫者傳進來的物件（程式後面可能還要用到 password、token）')
  const line = env.lines.at(-1)!
  for (const s of secrets) assert.ok(!line.includes(s), `log 裡出現了敏感值 ${s}：巢狀物件、陣列裡的物件、大小寫不同的欄位名稱都要遮蔽`)
  assert.equal(e.password, '[REDACTED]', '值要換成 "[REDACTED]"')
  assert.equal(e.token, '[REDACTED]', 'child 綁定的欄位也要遮蔽')
  assert.equal(e.headers?.Authorization, '[REDACTED]')
  assert.equal(e.headers?.accept, 'application/json', '不是敏感欄位的要保留')
  assert.equal(e.payment?.CardNumber, '[REDACTED]')
  assert.equal(e.payment?.method, 'card')
  assert.equal(e.accounts?.[0]?.PASSWORD, '[REDACTED]', '陣列裡的物件也要遮蔽')
  assert.equal(e.accounts?.[0]?.name, 'a')
  assert.equal(e.accounts?.[1]?.nested?.[0]?.token, '[REDACTED]')
  assert.equal(e.user, user)
  assert.equal(e.note, '密碼長度 8', '只看欄位名稱，不看值的內容')
})

test('循環參照與 BigInt 不能讓 logger 當掉；同一個物件出現兩次不算循環', opts, async () => {
  const env = await setup()
  const order: Record<string, unknown> = { id: 7 }
  order.self = order
  const e1 = one(env, () => env.logger.info('循環', { order }), '物件參照自己')
  assert.equal(e1.order?.id, 7)
  assert.equal(e1.order?.self, '[Circular]', '參照到自己祖先的地方換成 "[Circular]"')
  const err = new Error('自己是自己的 cause') as Error & { cause?: unknown }
  err.cause = err
  const e2 = one(env, () => env.logger.error('循環的 cause', { err }), 'cause 指回自己')
  assert.equal(e2.err?.message, '自己是自己的 cause')
  assert.equal(e2.err?.cause, '[Circular]', 'cause 指回自己時換成 "[Circular]"，不要無限往下走')
  const latte = { name: '拿鐵', price: 110 }
  const e3 = one(env, () => env.logger.info('兩次', { a: latte, b: [latte] }), '同一個物件出現兩次')
  assert.deepEqual(e3.a, latte, '同一個物件出現兩次不是循環，兩個地方都要完整輸出')
  assert.deepEqual(e3.b, [latte], '同一個物件出現兩次不是循環，兩個地方都要完整輸出')
  const big = 12345678901234567890n
  const e4 = one(env, () => env.logger.info('BigInt', { total: big }), 'BigInt')
  assert.equal(e4.total, big.toString(), 'BigInt 輸出成字串（JSON.stringify 遇到 BigInt 會丟錯）')
})
