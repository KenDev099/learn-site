// 練習 2：nginx/ex2.conf 在 443 終結 TLS，80 一律轉到 HTTPS，HSTS 只出現在 HTTPS
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { request, type RequestOptions } from 'node:https'
import { connect, type SecureVersion } from 'node:tls'
import { join } from 'node:path'
import { requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const compose = (args: string[], timeout = 180_000) =>
  run('docker', ['compose', '-p', 'ld-12', ...args], { cwd: dir, env: { CONF: 'ex2.conf' }, timeout })
const tail = (s: string) => s.split('\n').slice(-12).join('\n')
let up = { code: 1 as number | null, out: '' }
let ca: Buffer

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const certs = run('sh', ['make-certs.sh'], { cwd: dir, timeout: 60_000 })
  assert.equal(certs.code, 0, `sh make-certs.sh 失敗：${certs.stderr.split('\n').slice(-5).join('\n')}`)
  ca = readFileSync(join(dir, 'certs', 'ca.crt'))
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '120'], 300_000)
  up = { code: r.code, out: `${r.stderr}\n${r.stdout}\n${compose(['logs', 'nginx']).stdout}` }
})
after(() => compose(['down', '-v', '--remove-orphans']))

const needUp = () => assert.equal(up.code, 0, `CONF=ex2.conf docker compose -p ld-12 up -d --wait 失敗，nginx 的設定可能有錯：\n${tail(up.out)}`)

// 用 ca.crt 驗證伺服器憑證的 HTTPS 請求
const https = (path: string, opts: RequestOptions = {}) => new Promise<{ status: number, headers: Record<string, any>, body: string }>((resolve, reject) => {
  const req = request({ host: 'localhost', port: 18121, path, ca, timeout: 5_000, ...opts }, res => {
    let body = ''
    res.setEncoding('utf8').on('data', c => body += c).on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }))
  })
  req.on('error', e => reject(new Error(`https://localhost:18121${path} 連不上：${e.message}。443 要寫 listen 443 ssl; 和 ssl_certificate／ssl_certificate_key`)))
  req.end()
})
const handshake = (min: SecureVersion, max: SecureVersion) => new Promise<string>((resolve, reject) => {
  // SECLEVEL=0 讓 Node 這一端願意用舊版協定，才測得出 nginx 有沒有拒絕
  const s = connect({ host: '127.0.0.1', port: 18121, servername: 'localhost', ca, minVersion: min, maxVersion: max, ciphers: 'DEFAULT@SECLEVEL=0' }, () => {
    const v = s.getProtocol()!
    s.end(); resolve(v)
  })
  s.on('error', reject)
})

test('HTTPS 的 /api/products 回 200，後端看到 X-Forwarded-Proto: https', async () => {
  needUp()
  const r = await https('/api/products')
  assert.equal(r.status, 200, `GET https://localhost:18121/api/products 回 ${r.status}：${r.body.slice(0, 200)}`)
  const h = JSON.parse((await https('/api/debug/headers')).body).headers
  assert.equal(h['x-forwarded-proto'], 'https', `後端看到 X-Forwarded-Proto: ${h['x-forwarded-proto'] ?? '（沒有）'}：在 443 的 server 裡加 proxy_set_header X-Forwarded-Proto $scheme;，後端才知道原始請求是 HTTPS`)
})

test('HTTP 的 /orders?id=7 回 301 到 https://localhost:18121/orders?id=7，而且不帶 HSTS', async () => {
  needUp()
  const res = await fetch('http://localhost:18120/orders?id=7', { redirect: 'manual' })
  assert.equal(res.status, 301, `HTTP 回 ${res.status}：80 的 server 要 return 301 https://…;`)
  assert.equal(res.headers.get('location'), 'https://localhost:18121/orders?id=7', `Location 是 ${res.headers.get('location')}：要轉到主機上的 18121，並用 $request_uri 保留路徑和查詢字串`)
  assert.equal(res.headers.get('strict-transport-security'), null, 'HTTP 的回應帶了 HSTS：瀏覽器會忽略 HTTP 上的 HSTS，規格也要求不要送；add_header 只寫在 443 的 server')
  const api = await fetch('http://localhost:18120/api/products', { redirect: 'manual' })
  assert.equal(api.status, 301, `HTTP 的 /api/products 回 ${api.status}：80 的 server 要讓「任何路徑」都轉到 HTTPS，API 也不能繼續走明文`)
  assert.equal(api.headers.get('location'), 'https://localhost:18121/api/products', `HTTP 的 /api/products 轉到 ${api.headers.get('location')}`)
})

test('HTTPS 的回應都帶 HSTS，連 404 也有', async () => {
  needUp()
  const ok = await https('/api/products')
  assert.match(String(ok.headers['strict-transport-security'] ?? ''), /max-age=31536000/, `HTTPS 的 200 回應沒有 Strict-Transport-Security: max-age=31536000（現在是 ${ok.headers['strict-transport-security'] ?? '沒有'}）`)
  const nf = await https('/no-such-page')
  assert.equal(nf.status, 404, `https://localhost:18121/no-such-page 回 ${nf.status}，預期 404`)
  assert.ok(nf.headers['strict-transport-security'], '404 回應沒有 HSTS：add_header 預設只加在 200、301 這類成功回應，要加 always')
})

test('TLS 1.2 與 1.3 可以連，TLS 1.1 與 1.0 被拒絕', async () => {
  needUp()
  assert.equal(await handshake('TLSv1.3', 'TLSv1.3'), 'TLSv1.3', 'TLS 1.3 連不上')
  assert.equal(await handshake('TLSv1.2', 'TLSv1.2'), 'TLSv1.2', 'TLS 1.2 連不上')
  for (const v of ['TLSv1.1', 'TLSv1'] as const) {
    const got = await handshake(v, v).catch(() => null)
    assert.equal(got, null, `用 ${v} 也連得上：ssl_protocols 只留 TLSv1.2 TLSv1.3`)
  }
  const t = compose(['exec', '-T', 'nginx', 'nginx', '-T']).stdout
  const protos = [...t.matchAll(/^\s*ssl_protocols\s+([^;]+);/gm)].map(m => m[1])
  assert.ok(protos.every(p => !/TLSv1(\.1)?\b(?!\.)/.test(p)), `設定裡有 ssl_protocols ${protos.join('、')}：TLS 1.0、1.1 已經不安全，只留 TLSv1.2 TLSv1.3`)
})
