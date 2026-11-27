// 練習 2：為 stock.ts 的 getStock 寫測試。執行：node --test stock.spec.ts
// 規則：不能替換或 mock 全域的 fetch（判分時 fetch 被鎖住，改它會直接丟錯），要在測試裡開一個假上游
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { getStock } from './stock.ts'
import * as errors from './errors.ts'

// 直接把 fetch 換掉：不開假上游
test('正常回應', (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ productId: 2, stock: 13 }))
  return getStock('http://upstream.test', 2).then(r => assert.deepEqual(r, { productId: 2, stock: 13 }))
})
test('503', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('busy', { status: 503 }))
  await assert.rejects(getStock('http://upstream.test', 2), errors.UpstreamHttpError)
})
test('格式不對', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ stock: -1 }))
  await assert.rejects(getStock('http://upstream.test', 2), errors.UpstreamBadResponseError)
})
test('逾時', async (t) => {
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))))
  await assert.rejects(getStock('http://upstream.test', 2, { timeoutMs: 50 }), errors.UpstreamTimeoutError)
})
