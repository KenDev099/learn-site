// 練習 2：為 stock.ts 的 getStock 寫測試。執行：node --test stock.spec.ts
// 規則：不能替換或 mock 全域的 fetch（判分時 fetch 被鎖住，改它會直接丟錯），要在測試裡開一個假上游
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { getStock } from './stock.ts'
import * as errors from './errors.ts'

// 假上游：每個請求交給 handle 決定怎麼回（可以不回、晚點回、回一半）
// requests 記下收到的請求；connectionClosed 在第一個回應的連線關掉時完成
async function fakeUpstream(t: TestContext, handle: (req: IncomingMessage, res: ServerResponse) => void) {
  const requests: string[] = []
  const { promise: connectionClosed, resolve: closed } = Promise.withResolvers<void>()
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    res.on('close', () => closed())
    handle(req, res)
  })
  server.listen(0, '127.0.0.1')   // port 0：讓系統挑一個沒人用的
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, requests, connectionClosed }
}

test('正常回應：回傳 { productId, stock }，只打一次 GET /stock/:id', { timeout: 2000 }, async (t) => {
  const up = await fakeUpstream(t, (req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ productId: 2, stock: 13 }))
  })

  assert.deepEqual(await getStock(up.url, 2), { productId: 2, stock: 13 })
  assert.deepEqual(up.requests, ['GET /stock/2'])
})

test('上游不回應：超過 timeoutMs 丟 UpstreamTimeoutError', { timeout: 2000 }, async (t) => {
  const up = await fakeUpstream(t, () => {})   // 收到請求，永遠不回

  const started = performance.now()
  await assert.rejects(getStock(up.url, 2, { timeoutMs: 100 }), errors.UpstreamTimeoutError)
  assert.ok(performance.now() - started < 1000, '100ms 就該放棄')
})

test('上游回 503：丟 UpstreamHttpError（帶 status、Retry-After），取消 body 讓連線關掉', { timeout: 2000 }, async (t) => {
  const up = await fakeUpstream(t, (req, res) => {
    res.writeHead(503, { 'retry-after': '7', 'content-type': 'text/plain' })
    res.write('busy…')   // body 只送一半、不結束：沒取消 body 的話，連線會一直開著
  })

  // timeoutMs 設長一點：逾時的 signal 觸發時也會關掉連線，會蓋過「沒取消 body」的 bug
  await assert.rejects(getStock(up.url, 2, { timeoutMs: 5000 }), (err: unknown) => {
    assert.ok(err instanceof errors.UpstreamHttpError, `要丟 UpstreamHttpError，收到 ${String(err)}`)
    assert.equal(err.status, 503)
    assert.equal(err.retryAfter, '7')
    return true
  })
  await up.connectionClosed   // body 沒被取消時這裡會一直等，等到測試的 timeout（2 秒）就失敗
})

test('回應格式不對：丟 UpstreamBadResponseError', { timeout: 2000 }, async (t) => {
  for (const body of ['{"stock":-1}', '{"qty":3}', '{"stock":"13"}', 'not json']) {
    const up = await fakeUpstream(t, (req, res) => { res.end(body) })
    await assert.rejects(getStock(up.url, 2), errors.UpstreamBadResponseError, `回應 ${body} 要被當成格式錯誤`)
  }
})
