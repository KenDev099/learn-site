import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { startServer } from '../../helpers/proc.ts'

const opts = { timeout: 15_000 }
const INTERNAL = { error: { code: 'INTERNAL', message: '伺服器發生錯誤' } }

async function get(base: string, path: string) {
  try {
    return await fetch(base + path, { signal: AbortSignal.timeout(3000) })
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } }
    if (e.name === 'TimeoutError') assert.fail(`GET ${path} 3 秒都沒有回應：出錯時要回 500，或在標頭已送出時中斷連線`)
    assert.fail(`GET ${path} 連線失敗（${e.cause?.code ?? e.message}）：伺服器是不是倒了？`)
  }
}

async function stillAlive(server: Awaited<ReturnType<typeof startServer>>, after: string) {
  await new Promise(r => setTimeout(r, 50))
  assert.equal(server.child.exitCode, null, `${after} 之後伺服器程序結束了（stderr：${server.out.stderr.slice(0, 300)}）`)
  const res = await get(server.url, '/menu')
  assert.equal(res.status, 200, `${after} 之後 GET /menu 要照常回 200`)
  await res.body?.cancel()
}

for (const path of ['/boom-sync', '/boom-async']) {
  test(`${path}：回 500 和固定的錯誤訊息，伺服器繼續運作，錯誤印到 stderr`, opts, async () => {
    const server = await startServer(join(import.meta.dirname, 'server.ts'))
    const res = await get(server.url, path)
    const text = await res.text()
    assert.equal(res.status, 500, `${path} 要回 500，收到 ${res.status}`)
    assert.ok(!text.includes('s3cret'), `回應不能包含原始的錯誤訊息（會洩漏內部資訊）：${text.slice(0, 200)}`)
    assert.deepEqual(JSON.parse(text), INTERNAL, '500 的 body 要剛好是 { error: { code: "INTERNAL", message: "伺服器發生錯誤" } }')
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8', '500 也要是 JSON（用 sendError）')
    await stillAlive(server, path)
    assert.ok(server.out.stderr.includes('s3cret'), '錯誤不回給客戶端，但要用 console.error 印出來，不然出事時查不到原因')
    await server.stop()
  })
}

test('/boom-after-headers：標頭已送出時中斷連線，伺服器繼續運作', opts, async () => {
  const server = await startServer(join(import.meta.dirname, 'server.ts'))
  const res = await get(server.url, '/boom-after-headers')
  assert.equal(res.status, 200, '標頭在出錯前就送出了，客戶端會先看到 200')
  let body: string | null = null
  try {
    body = await Promise.race([res.text(), new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))])
  } catch (err) {
    assert.notEqual((err as Error).message, 'timeout', '回應一直沒結束：標頭已送出時要用 res.destroy() 中斷連線')
  }
  assert.equal(body, null, `客戶端完整收到了回應（${JSON.stringify(body)}），會以為報表是完整的：標頭已送出時要用 res.destroy() 中斷連線，不是 res.end()`)
  await stillAlive(server, '/boom-after-headers')
  assert.ok(server.out.stderr.includes('s3cret-after'), '這個錯誤也要用 console.error 印出來')
  await server.stop()
})
