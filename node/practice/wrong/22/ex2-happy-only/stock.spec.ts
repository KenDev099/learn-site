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

// 在下面繼續寫：上游不回應時會逾時；上游回 5xx 時丟 UpstreamHttpError，而且 body 被取消、連線關掉；回應格式不對時丟 UpstreamBadResponseError
// 用 errors.UpstreamTimeoutError 這樣的類別檢查錯誤種類：await assert.rejects(promise, errors.UpstreamTimeoutError)
