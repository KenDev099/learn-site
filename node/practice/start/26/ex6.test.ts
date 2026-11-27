import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { startServer } from '../../helpers/proc.ts'
import { MAIN, assertProblem, call, logLines, mainEnv, opts, setupDb, waitFor } from './testkit.ts'

const db = await setupDb()
const srv = await startServer(MAIN, { env: mainEnv(db.url, { ENABLE_TEST_ROUTES: '1' }) })
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')

test('每個回應帶 x-request-id；每個請求一行 access log', opts, async () => {
  const r1 = await call(srv.url + '/menu')
  const r2 = await call(srv.url + '/menu/2')
  const id1 = r1.headers.get('x-request-id'), id2 = r2.headers.get('x-request-id')
  assert.ok(id1 && id2, '每個回應都要帶 x-request-id 標頭')
  assert.notEqual(id1, id2, '每個請求的 x-request-id 要不一樣')
  assert.ok((await call(srv.url + '/nope')).headers.get('x-request-id'), '404 的回應也要帶 x-request-id')
  const find = (id: string) => logLines(srv.out.stdout).find(l => l.msg === 'request' && l.requestId === id)
  assert.ok(await waitFor(() => !!find(id1!) && !!find(id2!)), `stdout 要有 msg 為 "request"、requestId 等於回應標頭的 access log；目前的 log：${srv.out.stdout.slice(-400)}`)
  const line = find(id2!)!
  assert.equal(line.method, 'GET', 'access log 要有 method')
  assert.equal(line.path, '/menu/2', 'access log 要有 path')
  assert.equal(line.status, 200, 'access log 要有 status')
  assert.equal(typeof line.durationMs, 'number', 'access log 要有 durationMs（數字）')
})

test('未預期的錯誤：回 500＋errorId，不洩漏原始訊息；log 有同一個 errorId、requestId 與 stack', opts, async () => {
  const phone = `09${digits(2)}-${digits(3)}-${digits(3)}`
  const r = await call(`${srv.url}/__test/boom?phone=${phone}`)
  assertProblem(r, 500, 'internal', '/__test/boom 丟出未預期的錯誤')
  assert.equal(typeof r.json.errorId, 'string', '500 的 problem 要有 errorId')
  assert.ok(r.json.errorId.length >= 8, 'errorId 要夠長，才不會撞號（例如 randomUUID()）')
  for (const leak of ['duplicate key', 'customers_phone_key', phone]) {
    assert.ok(!r.text.includes(leak), `500 的回應出現了「${leak}」：原始錯誤只進 log，客戶端只拿到固定的說明和 errorId`)
  }
  const requestId = r.headers.get('x-request-id')
  const find = () => logLines(srv.out.stdout).find(l => l.errorId === r.json.errorId && l.level === 'error')
  assert.ok(await waitFor(() => !!find()), 'log 要有一行 level 為 error、errorId 和回應一樣的紀錄，客服才查得到')
  const line = find()!
  assert.equal(line.requestId, requestId, '錯誤的 log 要帶 requestId（用 logger.child({ requestId })），才能和 access log 對起來')
  assert.ok(/\n\s+at /.test(JSON.stringify(line).replace(/\\n/g, '\n')), '錯誤的 log 要有 stack（把 err 放進欄位，logger 會序列化）')
})

test('log 不能有 Authorization 的值與完整的手機號碼', opts, async () => {
  const token = randomBytes(12).toString('hex')
  const phones = [`09${digits(2)}-${digits(3)}-${digits(3)}`, `09${digits(8)}`]
  for (const phone of phones) {
    const r = await call(`${srv.url}/__test/boom?phone=${phone}`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(r.status, 500)
  }
  await waitFor(() => logLines(srv.out.stdout).filter(l => l.level === 'error').length >= 3)
  const all = srv.out.stdout + srv.out.stderr
  assert.ok(!all.includes(token), 'log 出現了 Authorization 標頭的 token')
  for (const phone of phones) {
    assert.ok(!all.includes(phone), `log 出現了完整的手機號碼 ${phone}：它藏在 pg 錯誤的 detail 裡（不在叫 phone 的欄位），要在 logger 輸出前對整行遮蔽`)
    assert.ok(!all.includes(phone.replace(/-/g, '')), `log 出現了完整的手機號碼 ${phone.replace(/-/g, '')}`)
  }
})
