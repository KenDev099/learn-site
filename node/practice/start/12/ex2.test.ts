import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { connect, type Server, type Socket } from 'node:net'
import { get, Server as HttpServer } from 'node:http'

const opts = { timeout: 15_000 }
const expected = { message: '歡迎光臨' }
const expectedBytes = Buffer.byteLength(JSON.stringify(expected))

async function start() {
  const mod: { createRawServer?: unknown } = await import('./raw-server.ts')
  assert.equal(typeof mod.createRawServer, 'function', 'raw-server.ts 要 export function createRawServer()')
  const server = (mod.createRawServer as () => Server)()
  assert.equal(typeof server?.listen, 'function', 'createRawServer() 要回傳 node:net 的 createServer(...) 建立的 Server')
  assert.ok(!(server instanceof HttpServer), '這題只能用 node:net：狀態行、標頭、空行要自己寫，不能用 node:http 的 createServer')
  const sockets = new Set<Socket>()
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  after(() => { for (const s of sockets) s.destroy(); server.close() })
  const { port } = server.address() as { port: number }
  return { url: `http://127.0.0.1:${port}`, port }
}

// fetch 等太久就放棄：沒有 Content-Length 又不關連線時，客戶端不知道 body 何時結束
async function fetchJson(url: string, init: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(3000) })
  } catch (e) {
    assert.fail(`fetch 失敗：${(e as Error).cause ?? e}。檢查狀態行、標頭的 \\r\\n、標頭和 body 之間的空行`)
  }
  let text: string
  try {
    text = await res.text()
  } catch {
    assert.fail('3 秒內收不完 body：要有正確的 Content-Length，送完要關閉連線（socket.end）')
  }
  return { res, text }
}

test('fetch：200、Content-Type、以位元組計算的 Content-Length、Connection: close、完整的中文 body', opts, async () => {
  const { url } = await start()
  const { res, text } = await fetchJson(url + '/')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(res.headers.get('content-length'), String(expectedBytes), `Content-Length 要是 body 的位元組數 ${expectedBytes}（Buffer.byteLength），不是字串長度`)
  assert.equal(res.headers.get('connection'), 'close')
  let data: unknown
  try { data = JSON.parse(text) } catch { assert.fail(`body 不是完整的 JSON，收到：${text}`) }
  assert.deepEqual(data, expected)
})

test('任何請求都回同樣的內容，連續兩次都正確（POST 也一樣）', opts, async () => {
  const { url } = await start()
  for (const [path, init] of [['/menu?size=L', {}], ['/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"drink":"拿鐵"}' }]] as const) {
    const { res, text } = await fetchJson(url + path, init)
    assert.equal(res.status, 200, `${path} 也要回 200`)
    assert.equal(text, JSON.stringify(expected), `${path} 的 body 不對`)
  }
})

test('node:http 的 get 也能正確讀到回應', opts, async () => {
  const { url } = await start()
  const { status, headers, body } = await new Promise<{ status?: number, headers: Record<string, unknown>, body: string }>((resolve, reject) => {
    const req = get(url + '/menu', { timeout: 3000 }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('3 秒內沒有收完回應')))
    req.on('error', reject)
  }).catch((e: Error) => assert.fail(`http.get 失敗：${e.message}`))
  assert.equal(status, 200)
  assert.equal(headers['content-length'], String(expectedBytes))
  assert.deepEqual(JSON.parse(body), expected)
})

test('請求分好幾段到達：收到空行（\\r\\n\\r\\n）之前不能回應', opts, async () => {
  const { port } = await start()
  const socket = connect(port, '127.0.0.1')
  after(() => socket.destroy())
  await once(socket, 'connect')
  const chunks: Buffer[] = []
  socket.on('data', c => chunks.push(c))
  const ended = once(socket, 'close')
  socket.write('GET /menu HTTP/1.1\r\nHost: shop\r\n')
  await new Promise(r => setTimeout(r, 300))
  assert.equal(chunks.length, 0, '標頭還沒收完（還沒看到 \\r\\n\\r\\n）就回應了：要把收到的 data 累積起來，看到空行才回')
  socket.write('Accept: */*\r\n')
  await new Promise(r => setTimeout(r, 100))
  assert.equal(chunks.length, 0, '標頭還沒收完就回應了')
  socket.write('\r\n')
  const timer = setTimeout(() => socket.destroy(), 3000)
  await ended
  clearTimeout(timer)
  const raw = Buffer.concat(chunks).toString('utf8')
  assert.match(raw, /^HTTP\/1\.1 200 OK\r\n/, `回應要以狀態行 HTTP/1.1 200 OK\\r\\n 開頭，收到：${JSON.stringify(raw.slice(0, 80))}`)
  assert.ok(raw.endsWith('\r\n\r\n' + JSON.stringify(expected)), '回應的最後要是空行加 body，而且送完要關閉連線')
})
