import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { run } from '../../helpers/proc.ts'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
const script = join(import.meta.dirname, 'requests.sh')
type Seen = { method?: string, url?: string, headers: Record<string, string | string[] | undefined>, body: string }

// 記錄每一個收到的請求；GET /menu 回一個隨機的 2xx 狀態碼和 body，其他回 204（沒有 body）
async function recorder() {
  const seen: Seen[] = []
  const menuStatus = [200, 202, 203][Math.floor(Math.random() * 3)]
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c)
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
    if (req.method === 'GET' && req.url === '/menu') {
      res.writeHead(menuStatus, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify([{ name: '拿鐵', price: 110 }]))
    } else {
      res.writeHead(204).end()
    }
  })
  const { url } = await listen(server)
  const r = await run('sh', [script], { env: { BASE_URL: url } })
  const list = seen.map(s => `${s.method} ${s.url}`).join('、') || '沒有'
  return { seen, menuStatus, r, list }
}

const json = (s: Seen, what: string) => {
  try { return JSON.parse(s.body) } catch { assert.fail(`${what} 的 body 不是 JSON，收到：${s.body}`) }
}

test('(a) GET $BASE_URL/menu：stdout 只有狀態碼', opts, async () => {
  const { seen, menuStatus, r, list } = await recorder()
  assert.ok(seen.some(s => s.method === 'GET' && s.url === '/menu'), `伺服器沒收到 GET /menu（收到：${list}）：網址要用 "$BASE_URL/menu"，不要寫死 localhost:3000`)
  assert.equal(r.stdout.trim(), String(menuStatus), `整個腳本的 stdout 只能有 (a) 的狀態碼 ${menuStatus}：用 -s -o /dev/null -w '%{http_code}'，收到：${JSON.stringify(r.stdout)}`)
})

test('(b) POST $BASE_URL/orders：JSON body 和 Content-Type: application/json', opts, async () => {
  const { seen, list } = await recorder()
  const s = seen.find(s => s.url === '/orders')
  assert.ok(s, `伺服器沒收到 /orders 的請求（收到：${list}）：網址要用 "$BASE_URL/orders"`)
  assert.equal(s.method, 'POST')
  assert.match(String(s.headers['content-type']), /^application\/json\b/, `Content-Type 要是 application/json，收到 ${s.headers['content-type']}：-d 預設是 application/x-www-form-urlencoded，改用 --json 或加 -H`)
  assert.deepEqual(json(s, '(b)'), { drink: '拿鐵', qty: 2 })
})

test('(c) PATCH $BASE_URL/orders/1：JSON body 和 X-Request-Id 標頭', opts, async () => {
  const { seen, list } = await recorder()
  const s = seen.find(s => s.url === '/orders/1')
  assert.ok(s, `伺服器沒收到 /orders/1 的請求（收到：${list}）`)
  assert.equal(s.method, 'PATCH', '方法要是 PATCH：有 body 時 curl 預設用 POST，要用 -X PATCH 指定')
  assert.match(String(s.headers['content-type']), /^application\/json\b/, `Content-Type 要是 application/json，收到 ${s.headers['content-type']}`)
  assert.deepEqual(json(s, '(c)'), { status: 'ready' })
  assert.equal(s.headers['x-request-id'], 'test-123', '要帶標頭 X-Request-Id: test-123（-H）')
})
