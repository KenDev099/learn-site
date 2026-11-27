// 練習 3：cert-days-left.ts 連上線上的 TLS 伺服器讀憑證。測試當場用 openssl 產生 5 天、60 天到期與不被信任的憑證，各開一台 TLS 伺服器
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import tls from 'node:tls'
import { run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const tmp = mkdtempSync(join(tmpdir(), 'ld-05-'))
const servers: tls.Server[] = []
const ports: Record<string, number> = {}

function openssl(...args: string[]) {
  const r = run('openssl', args, { cwd: tmp, timeout: 30_000 })
  assert.equal(r.code, 0, `測試環境建不起來（openssl ${args[0]}）：${r.stderr}`)
}
// 用測試自己的 CA 簽一張 days 天的 localhost 憑證
function leaf(name: string, days: number) {
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=localhost')
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-set_serial', String(Date.now()), '-days', String(days), '-extfile', 'leaf.ext', '-out', `${name}.crt`)
}
const file = (f: string) => readFileSync(join(tmp, f))
const listen = (s: tls.Server) => new Promise<number>(r => { servers.push(s); s.listen(0, '127.0.0.1', () => r((s.address() as any).port)) })

// 用非同步的 spawn 執行學習者的程式：測試裡的 TLS 伺服器要同時能回應
function check(host: string, port: number) {
  return new Promise<{ code: number | null, stdout: string, stderr: string }>(resolve => {
    const p = spawn(process.execPath, ['cert-days-left.ts', host, String(port)], { cwd: dir, env: { ...process.env, NODE_EXTRA_CA_CERTS: join(tmp, 'ca.crt') } })
    let stdout = '', stderr = ''
    p.stdout.on('data', d => { stdout += d })
    p.stderr.on('data', d => { stderr += d })
    const timer = setTimeout(() => p.kill(), 30_000)
    p.on('close', code => { clearTimeout(timer); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }) })
  })
}
const daysLeft = (crt: string) => Math.floor((new X509Certificate(file(crt)).validToDate.getTime() - Date.now()) / 86_400_000)

before(async () => {
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '30', '-subj', '/CN=Test CA',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
  run('sh', ['-c', "printf '%s\\n' 'basicConstraints = CA:FALSE' 'subjectAltName = DNS:localhost, IP:127.0.0.1' > leaf.ext"], { cwd: tmp })
  leaf('soon', 5)
  leaf('fine', 60)
  leaf('edge', 15)
  // 自簽、不在信任清單裡的憑證：沒有 SNI 時預設送這張
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'self.key', '-out', 'self.crt', '-days', '60', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1')
  ports.soon = await listen(tls.createServer({ key: file('soon.key'), cert: file('soon.crt') }))
  ports.edge = await listen(tls.createServer({ key: file('edge.key'), cert: file('edge.crt') }))
  const fine = tls.createSecureContext({ key: file('fine.key'), cert: file('fine.crt') })
  ports.sni = await listen(tls.createServer({ key: file('self.key'), cert: file('self.crt'), SNICallback: (name, cb) => cb(null, name === 'localhost' ? fine : undefined) }))
  const closed = await listen(tls.createServer({}))
  servers.pop()!.close()
  ports.closed = closed
})
after(() => { for (const s of servers) s.close(); rmSync(tmp, { recursive: true, force: true }) })

test('5 天後到期：印出剩餘天數（無條件捨去）並以 1 結束', async () => {
  const r = await check('127.0.0.1', ports.soon)
  const want = daysLeft('soon.crt')
  assert.equal(r.stdout, String(want), `對 127.0.0.1:${ports.soon} 應該只印出 ${want}，你印出「${r.stdout}」${r.stderr ? `（stderr：${r.stderr.split('\n')[0]}）` : ''}。讀的是線上伺服器送來的憑證（getPeerX509Certificate），剩餘時間用 Math.floor 換成天數`)
  assert.equal(r.code, 1, `少於 14 天要以 1 結束，現在是 ${r.code}`)
})

test('剛好剩 14 天（不到 15 天）：不算「少於 14 天」，以 0 結束', async () => {
  const r = await check('127.0.0.1', ports.edge)
  const want = daysLeft('edge.crt')
  assert.equal(r.stdout, String(want), `對 127.0.0.1:${ports.edge} 應該只印出 ${want}，你印出「${r.stdout}」`)
  assert.equal(r.code, 0, `剩 ${want} 天不是「少於 14 天」，要以 0 結束，現在是 ${r.code}：條件是 days < 14，不是 <= 14`)
})

test('用網域名稱連線要送 SNI：60 天的憑證印出剩餘天數並以 0 結束', async () => {
  const r = await check('localhost', ports.sni)
  const want = daysLeft('fine.crt')
  assert.equal(r.stdout, String(want), `對 localhost:${ports.sni} 應該只印出 ${want}，你印出「${r.stdout}」${r.stderr ? `（stderr：${r.stderr.split('\n')[0]}）` : ''}。這台伺服器只有收到 SNI＝localhost 才送正確的憑證：tls.connect 不會自動送 SNI，要設 servername`)
  assert.equal(r.code, 0, `剩 14 天以上要以 0 結束，現在是 ${r.code}`)
})

test('憑證不被信任：當成握手失敗，以 2 結束', async () => {
  const r = await check('127.0.0.1', ports.sni)
  assert.equal(r.code, 2, `這台伺服器送的是不被信任的自簽憑證，應該以 2 結束，現在是 ${r.code}（輸出：${r.stdout}）。不要設 rejectUnauthorized: false：監控也要知道憑證不被信任`)
})

test('連不上：以 2 結束，不丟出未處理的例外', async () => {
  const r = await check('127.0.0.1', ports.closed)
  assert.equal(r.code, 2, `127.0.0.1:${ports.closed} 沒有人在聽，應該以 2 結束，現在是 ${r.code}。要監聽 socket 的 'error' 事件${r.stderr ? `\nstderr：${r.stderr.split('\n').slice(0, 3).join('\n')}` : ''}`)
})
