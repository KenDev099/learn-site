// 練習 1：make-certs.sh 產生私有 CA 與 localhost 的伺服器憑證。用 Node 的 X509Certificate 逐項檢查
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate, createPrivateKey } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const DAY = 86_400_000
const load = (f: string) => {
  try { return readFileSync(join(dir, f)) } catch { throw new Error(`make-certs.sh 跑完後沒有 ${f}：檢查 -out／-keyout 的檔名`) }
}
let ca: X509Certificate, server: X509Certificate

before(() => {
  // 先刪掉上一次產生的結果，確定檢查的是這一次執行產生的檔案
  for (const f of ['ca.crt', 'server.crt', 'server.key']) rmSync(join(dir, f), { force: true })
  const r = run('sh', ['make-certs.sh'], { cwd: dir, timeout: 60_000 })
  assert.equal(r.code, 0, `sh make-certs.sh 失敗（結束碼 ${r.code}）：${r.stderr.split('\n').slice(-5).join('\n')}`)
  ca = new X509Certificate(load('ca.crt'))
  server = new X509Certificate(load('server.crt'))
})

test('ca.crt 是 CA 憑證，server.crt 不是', () => {
  assert.equal(ca.ca, true, 'ca.crt 要有 basicConstraints=critical,CA:TRUE 才能簽發別的憑證')
  assert.equal(server.ca, false, 'server.crt 不能是 CA（basicConstraints = CA:FALSE）：直接用 req -x509 產生的自簽憑證預設是 CA，不是由 CA 簽發的伺服器憑證')
  assert.notEqual(server.fingerprint256, ca.fingerprint256, 'ca.crt 和 server.crt 是同一張：要先做 CA，再用 CA 簽發另一張伺服器憑證')
})

test('server.crt 由 ca.crt 簽發，簽章驗得過', () => {
  assert.equal(server.checkIssued(ca), true, `server.crt 的簽發者（${server.issuer}）不是 ca.crt（${ca.subject}）：用 openssl x509 -req -CA ca.crt -CAkey ca.key 簽發`)
  assert.equal(server.verify(ca.publicKey), true, 'server.crt 的簽章用 ca.crt 的公鑰驗不過：簽發時要用和 ca.crt 配對的 ca.key')
})

test('SAN 含 DNS:localhost 與 IP:127.0.0.1（不靠 CN）', () => {
  assert.ok(server.checkHost('localhost', { subject: 'never' }), `用瀏覽器的規則（只看 SAN）比對 localhost 失敗，目前的 SAN：${server.subjectAltName ?? '沒有'}。只寫 CN=localhost 不夠，要加 subjectAltName = DNS:localhost`)
  assert.ok(server.checkIP('127.0.0.1'), `SAN 裡沒有 IP:127.0.0.1（目前：${server.subjectAltName ?? '沒有'}）：用 IP 連線時比對的是 IP 項目，不是 DNS`)
})

test('伺服器憑證有效期不超過 200 天，而且現在有效', () => {
  const days = (server.validToDate.getTime() - server.validFromDate.getTime()) / DAY
  assert.ok(days <= 200, `有效期 ${Math.round(days)} 天：公開憑證從 2026-03-15 起上限是 200 天，練習也照這個規則（-days 90）`)
  const now = Date.now()
  assert.ok(server.validFromDate.getTime() <= now && now < server.validToDate.getTime(), `憑證現在不在有效期內（${server.validFrom} ～ ${server.validTo}）`)
})

test('server.key 和 server.crt 是一對', () => {
  assert.equal(server.checkPrivateKey(createPrivateKey(load('server.key'))), true, 'server.key 不是 server.crt 裡公鑰的那把私鑰：CSR 要用同一把 server.key 產生')
})
