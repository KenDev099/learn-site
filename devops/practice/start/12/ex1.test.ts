// 練習 1：nginx/ex1.conf 把 /api/ 轉給後端、轉送正確的標頭，並為前端檔案設定快取
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { isIP } from 'node:net'
import { request } from 'node:http'
import { requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const compose = (args: string[], timeout = 180_000) =>
  run('docker', ['compose', '-p', 'ld-12', ...args], { cwd: dir, env: { CONF: 'ex1.conf' }, timeout })
const tail = (s: string) => s.split('\n').slice(-12).join('\n')
const BASE = 'http://localhost:18120'
let up = { code: 1 as number | null, out: '' }

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '120'], 300_000)
  up = { code: r.code, out: `${r.stderr}\n${r.stdout}\n${compose(['logs', 'nginx']).stdout}` }
})
after(() => compose(['down', '-v', '--remove-orphans']))

const needUp = () => assert.equal(up.code, 0, `CONF=ex1.conf docker compose -p ld-12 up -d --wait 失敗，nginx 的設定可能有錯：\n${tail(up.out)}\n先用 docker compose -p ld-12 run --rm nginx nginx -t 看是哪一行`)
const headers = async (init?: RequestInit) => {
  const res = await fetch(`${BASE}/api/debug/headers`, init)
  assert.equal(res.status, 200, `GET /api/debug/headers 回 ${res.status}：先讓 /api/products 通過`)
  return ((await res.json()) as any).headers as Record<string, string>
}

test('nginx -t 通過', () => {
  needUp()
  const r = compose(['exec', '-T', 'nginx', 'nginx', '-t'])
  assert.equal(r.code, 0, `nginx -t 失敗：${r.stderr}`)
})

test('GET /api/products 由後端的 /products 回答（/api 前綴被去掉）', async () => {
  needUp()
  const res = await fetch(`${BASE}/api/products`)
  const body = await res.text()
  assert.equal(res.status, 200, `GET /api/products 回 ${res.status}：${body.slice(0, 200)}\n後端只有 /products；proxy_pass 沒寫 URI 時會原樣轉送 /api/products，要寫 proxy_pass http://api:3000/; 讓 /api/ 換成 /`)
  assert.equal(JSON.parse(body).length, 6, '應該拿到 6 個商品')
})

test('後端看到的 Host 是用戶端連的 localhost，不是 api:3000', async () => {
  needUp()
  const h = await headers()
  assert.match(h.host ?? '', /^localhost(:18120)?$/, `後端看到 Host: ${h.host}：nginx 預設送 $proxy_host（api:3000），要加 proxy_set_header Host $host;`)
})

test('用戶端連的是別的網域時，後端看到的 Host 也跟著變（不是寫死的值）', async () => {
  needUp()
  // fetch 不能改 Host，用 node:http 模擬客人連 brew.example.tw
  const body = await new Promise<string>((resolve, reject) => {
    const req = request({ host: 'localhost', port: 18120, path: '/api/debug/headers', headers: { Host: 'brew.example.tw' } }, res => {
      let b = ''
      res.setEncoding('utf8').on('data', c => b += c).on('end', () => resolve(b))
    })
    req.on('error', reject)
    req.end()
  })
  const host = JSON.parse(body).headers?.host
  assert.equal(host, 'brew.example.tw', `客人連 brew.example.tw，後端卻看到 Host: ${host}：用 $host 轉送客人請求裡的主機名稱，不要寫死 localhost`)
})

test('X-Forwarded-Proto 是 http，X-Request-ID 是 nginx 產生的 32 個十六進位字元', async () => {
  needUp()
  const h = await headers()
  assert.equal(h['x-forwarded-proto'], 'http', `後端看到 X-Forwarded-Proto: ${h['x-forwarded-proto'] ?? '（沒有）'}：用 $scheme`)
  assert.match(h['x-request-id'] ?? '', /^[0-9a-f]{32}$/, `後端看到 X-Request-ID: ${h['x-request-id'] ?? '（沒有）'}：用 $request_id`)
  const again = await headers()
  assert.notEqual(again['x-request-id'], h['x-request-id'], '兩個請求的 X-Request-ID 一樣：每個請求要有自己的 ID，用 $request_id，不要寫死')
})

test('X-Forwarded-For 的最後一個是 nginx 看到的用戶端位址，用戶端自己帶的值不能取代它', async () => {
  needUp()
  const plain = (await headers())['x-forwarded-for'] ?? ''
  const real = plain.split(',').pop()!.trim()
  assert.ok(isIP(real), `沒帶 X-Forwarded-For 時，後端看到「${plain}」：要加上 nginx 看到的用戶端位址（$proxy_add_x_forwarded_for 或 $remote_addr）`)
  const spoofed = (await headers({ headers: { 'X-Forwarded-For': '203.0.113.9' } }))['x-forwarded-for'] ?? ''
  assert.equal(spoofed.split(',').pop()!.trim(), real, `用戶端自己帶 X-Forwarded-For: 203.0.113.9，後端看到「${spoofed}」：最後一段要是 nginx 看到的位址 ${real}，不能直接轉送用戶端給的值`)
})

test('GET / 回 index.html，Cache-Control 含 no-cache', async () => {
  needUp()
  const res = await fetch(`${BASE}/`)
  const body = await res.text()
  assert.equal(res.status, 200, `GET / 回 ${res.status}：root 要指到 /srv/static`)
  assert.match(body, /咖啡店（第 12 課的前端）/, 'GET / 回的不是 static/index.html')
  const cc = res.headers.get('cache-control') ?? ''
  assert.match(cc, /no-cache/, `GET / 的 Cache-Control 是「${cc}」：index.html 檔名固定，要 no-cache，每次回伺服器確認才拿得到新版`)
  assert.doesNotMatch(cc, /immutable|max-age=[1-9]/, `GET / 的 Cache-Control 是「${cc}」：index.html 不能長快取，否則發新版後使用者還在用舊的`)
})

test('GET /assets/app.3f9a1c.js 快取一年而且 immutable', async () => {
  needUp()
  const res = await fetch(`${BASE}/assets/app.3f9a1c.js`)
  assert.equal(res.status, 200, `GET /assets/app.3f9a1c.js 回 ${res.status}`)
  assert.match(await res.text(), /cafe app 3f9a1c/, '回的不是 static/assets/app.3f9a1c.js')
  const cc = res.headers.get('cache-control') ?? ''
  assert.match(cc, /max-age=31536000\b/, `Cache-Control 是「${cc}」：雜湊檔名的檔案要 max-age=31536000`)
  assert.match(cc, /immutable/, `Cache-Control 是「${cc}」：再加上 immutable，瀏覽器重新整理時也不會回來確認`)
})
