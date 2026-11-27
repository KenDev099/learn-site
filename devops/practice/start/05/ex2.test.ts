// 練習 2：https-server.ts 在 127.0.0.1:18050 提供 HTTPS、18051 的 HTTP 一律 301 轉到 HTTPS。用你的 ca.crt 驗證，不關掉驗證
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { connect } from 'node:net'
import https from 'node:https'
import tls from 'node:tls'
import { randomUUID } from 'node:crypto'
import { run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
let child: ChildProcess | undefined
let output = ''
let ca: Buffer

const portOpen = (port: number) => new Promise<boolean>(resolve => {
  const s = connect(port, '127.0.0.1')
  s.on('connect', () => { s.destroy(); resolve(true) })
  s.on('error', () => resolve(false))
})

// 用 ca.crt 當唯一信任的 CA、以 localhost 這個名字驗證（rejectUnauthorized 維持預設 true）
function httpsGet(path: string) {
  return new Promise<{ status: number, headers: Record<string, any> }>((resolve, reject) => {
    const req = https.get({ host: '127.0.0.1', servername: 'localhost', port: 18050, path, ca, agent: false }, res => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers }))
    })
    req.setTimeout(3_000, () => req.destroy(new Error('3 秒沒有回應')))
    req.on('error', reject)
  })
}

before(async () => {
  const r = run('sh', ['make-certs.sh'], { cwd: dir, timeout: 60_000 })
  assert.equal(r.code, 0, `先完成練習 1：sh make-certs.sh 失敗（${r.stderr.split('\n').slice(-3).join(' ')}）`)
  ca = readFileSync(join(dir, 'ca.crt'))
  child = spawn(process.execPath, ['https-server.ts'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout!.on('data', d => { output += d })
  child.stderr!.on('data', d => { output += d })
  const end = Date.now() + 10_000
  while (Date.now() < end && child.exitCode === null && !(await portOpen(18050) && await portOpen(18051)))
    await new Promise(r => setTimeout(r, 200))
})
after(() => { child?.kill() })

const why = () => child?.exitCode !== null ? `\nnode https-server.ts 已經結束了，輸出：\n${output.trim().split('\n').slice(-8).join('\n')}` : ''

test('HTTPS：https://localhost:18050/health/live 回 200（用 ca.crt 驗證得過）', async () => {
  let res
  try { res = await httpsGet('/health/live') } catch (e) {
    assert.fail(`HTTPS 連線失敗：${(e as Error).message}。要用 https.createServer({ key, cert }) 載入 server.key、server.crt，聽 127.0.0.1:18050${why()}`)
  }
  assert.equal(res.status, 200, 'GET /health/live 要回 200')
})

test('HTTPS 回應帶 Strict-Transport-Security: max-age=300', async () => {
  const res = await httpsGet('/health/live').catch(e => assert.fail(`HTTPS 連不上：${e.message}${why()}`))
  assert.equal(res.headers['strict-transport-security'], 'max-age=300', '每個 HTTPS 回應都要帶 Strict-Transport-Security: max-age=300（先設短，確定沒問題再拉長）')
  const notFound = await httpsGet('/no-such-page').catch(e => assert.fail(`HTTPS 連不上：${e.message}${why()}`))
  assert.equal(notFound.headers['strict-transport-security'], 'max-age=300', `GET /no-such-page（狀態 ${notFound.status}）沒有帶 HSTS：每個 HTTPS 回應都要帶，不是只有 /health/live。在處理函式一開始就 setHeader`)
})

test('HTTP：任何路徑都 301 轉到 https://localhost:18050，保留路徑與查詢字串', async () => {
  for (const path of ['/orders?id=7', `/cart/items?sid=${randomUUID()}&qty=2`, '/', '/health/live']) {
    const res = await fetch(`http://127.0.0.1:18051${path}`, { redirect: 'manual', signal: AbortSignal.timeout(3_000) })
      .catch(e => assert.fail(`http://127.0.0.1:18051 連不上：${e.cause?.message ?? e.message}。要另外開一台 http.createServer 聽 127.0.0.1:18051${why()}`))
    assert.equal(res.status, 301, `GET ${path} 要回 301（永久轉址），現在是 ${res.status}`)
    assert.equal(res.headers.get('location'), `https://localhost:18050${path}`,
      `GET ${path} 的 Location 要是 https://localhost:18050${path}：協定 https、port 18050、用 req.url 保留路徑和查詢字串；不要用請求的 Host 標頭組網址`)
  }
})

test('HTTP 回應不帶 Strict-Transport-Security', async () => {
  const res = await fetch('http://127.0.0.1:18051/orders?id=7', { redirect: 'manual', signal: AbortSignal.timeout(3_000) })
    .catch(e => assert.fail(`http://127.0.0.1:18051 連不上：${e.cause?.message ?? e.message}${why()}`))
  assert.equal(res.headers.get('strict-transport-security'), null, '瀏覽器會忽略從 HTTP 收到的 HSTS（RFC 6797），規格也要求伺服器不要在 HTTP 回應裡送：只加在 HTTPS 那一台')
})

test('HTTPS 拒絕 TLS 1.1 以下的連線', async () => {
  // 用戶端刻意允許 TLS 1.0／1.1（@SECLEVEL=0），只有伺服器也放寬時才會連上
  const result = await new Promise<string>(resolve => {
    const s = tls.connect({ host: '127.0.0.1', servername: 'localhost', port: 18050, ca, minVersion: 'TLSv1', maxVersion: 'TLSv1.1', ciphers: 'DEFAULT@SECLEVEL=0' }, () => { resolve(s.getProtocol() ?? '?'); s.end() })
    s.setTimeout(3_000, () => s.destroy(new Error('timeout')))
    s.on('error', e => resolve(`error:${(e as any).code ?? e.message}`))
  })
  if (result === 'error:ECONNREFUSED') assert.fail(`HTTPS 連不上 127.0.0.1:18050${why()}`)
  assert.ok(result.startsWith('error:'), `用 ${result} 連上了：不要調低 minVersion，維持 Node 預設的 TLSv1.2`)
})
