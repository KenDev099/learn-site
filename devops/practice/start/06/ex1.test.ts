// 練習 1：金鑰登入。keygen.sh 產生金鑰、ssh_config 設定 cafe-server、trust-host.sh 比對指紋後才信任主機
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { docker, removeContainers, requireDocker, run } from '../../helpers/docker.ts'
import { SERVER, sh, ssh, waitSsh } from './server/lab.ts'

const dir = import.meta.dirname
const FAKE = 'ld-06-fake'
const inside = (p: string) => resolve(dir, p).startsWith(dir + sep)
let keygen = { code: 0 as number | null, stderr: '' }

// ssh -G 印出 ssh 最後採用的設定（全部小寫、一行一個）
function config() {
  const r = run('ssh', ['-F', 'ssh_config', '-G', 'cafe-server'], { cwd: dir })
  assert.equal(r.code, 0, `ssh_config 有語法錯誤：${r.stderr}`)
  const all = r.stdout.split('\n').map(l => l.split(' '))
  const one = (k: string) => all.find(([key]) => key === k)?.slice(1).join(' ') ?? ''
  return { one, many: (k: string) => all.filter(([key]) => key === k).map(a => a.slice(1).join(' ')) }
}

before(() => {
  requireDocker()
  removeContainers(SERVER, FAKE)
  const b = run('docker', ['build', '-q', '-t', 'ld-06-server:1', 'server'], { cwd: dir, timeout: 600_000 })
  if (b.code !== 0) throw new Error(`建置練習伺服器的映像失敗：${b.stderr}`)
  keygen = sh(dir, 'keygen.sh')
})
after(() => removeContainers(SERVER, FAKE))

test('keygen.sh 產生 ed25519 金鑰、私鑰權限 600，公鑰放進 authorized_keys', () => {
  assert.equal(keygen.code, 0, `sh keygen.sh 失敗：${keygen.stderr}`)
  const key = join(dir, 'keys', 'id_ed25519')
  assert.ok(existsSync(key) && existsSync(key + '.pub'), '要產生 keys/id_ed25519 和 keys/id_ed25519.pub（ssh-keygen -f keys/id_ed25519）')
  const mode = (statSync(key).mode & 0o777).toString(8)
  assert.equal(mode, '600', `私鑰權限是 ${mode}：別人讀得到的私鑰，ssh 會拒絕使用（UNPROTECTED PRIVATE KEY FILE），改成 chmod 600`)
  const info = run('ssh-keygen', ['-lf', key + '.pub']).stdout
  assert.match(info, /\(ED25519\)$/, `金鑰類型要是 ed25519（ssh-keygen -t ed25519），現在是：${info}`)
  const pub = readFileSync(key + '.pub', 'utf8').trim().split(' ').slice(0, 2).join(' ')
  assert.ok(existsSync(join(dir, 'authorized_keys')) && readFileSync(join(dir, 'authorized_keys'), 'utf8').includes(pub),
    'authorized_keys 要包含 keys/id_ed25519.pub 的內容（放公鑰，不是私鑰）')
  const again = sh(dir, 'keygen.sh')
  assert.equal(again.code, 0, `第二次執行 keygen.sh 失敗：已經有金鑰時要跳過 ssh-keygen。${again.stderr}`)
  assert.ok(readFileSync(key + '.pub', 'utf8').includes(pub), '第二次執行不能重新產生金鑰：伺服器上的舊公鑰會失效')
})

test('ssh_config：cafe-server 指到 127.0.0.1:18060 的 ubuntu，只用這個資料夾的金鑰和 known_hosts', () => {
  const { one, many } = config()
  assert.ok(['127.0.0.1', 'localhost'].includes(one('hostname')), `HostName 要是 127.0.0.1，現在是 ${one('hostname')}`)
  assert.equal(one('port'), '18060', 'Port 要是 18060')
  assert.equal(one('user'), 'ubuntu', 'User 要是 ubuntu')
  const ids = many('identityfile')
  assert.ok(ids.length > 0 && ids.every(inside), `IdentityFile 要是這個資料夾裡的 ./keys/id_ed25519，現在是 ${ids.join('、')}：練習不能用 ~/.ssh 裡你自己的金鑰`)
  assert.equal(one('identitiesonly'), 'yes', '加上 IdentitiesOnly yes：只用 IdentityFile 指定的金鑰，不要把 agent 裡的每把金鑰都拿去試')
  const known = one('userknownhostsfile').split(' ')
  assert.ok(known.every(inside), `UserKnownHostsFile 要是這個資料夾裡的 ./known_hosts，現在是 ${known.join(' ')}：不要寫進你自己的 ~/.ssh/known_hosts`)
  assert.ok(!['false', 'no', 'off'].includes(one('stricthostkeychecking')), 'StrictHostKeyChecking no 會讓 ssh 接受任何主機金鑰，等於不檢查對方是誰：拿掉它')
})

test('trust-host.sh：有人冒充伺服器（指紋對不上）時拒絕，known_hosts 不變', async () => {
  // 真的伺服器沒有發布 port；冒牌貨占住 127.0.0.1:18060，用自己剛產生的主機金鑰
  const real = docker('run', '-d', '--name', SERVER, '--entrypoint', 'sleep', 'ld-06-server:1', 'infinity')
  assert.equal(real.code, 0, `啟動練習伺服器失敗：${real.stderr}`)
  const fake = docker('run', '-d', '--name', FAKE, '-p', '127.0.0.1:18060:22', '--entrypoint', 'sh', 'ld-06-server:1', '-c',
    'rm -f /etc/ssh/ssh_host_* && ssh-keygen -A >/dev/null && mkdir -p /run/sshd && exec /usr/sbin/sshd -D')
  assert.equal(fake.code, 0, `啟動冒牌伺服器失敗：${fake.stderr}`)
  await waitSsh()
  const file = join(dir, 'known_hosts')
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null
  const r = sh(dir, 'trust-host.sh')
  removeContainers(SERVER, FAKE)
  assert.notEqual(r.code, 0, 'ssh-keyscan 拿到的是冒牌貨的金鑰，trust-host.sh 卻成功了：要跟 docker exec ld-06-server ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 的指紋比對，對不上就 exit 1')
  const now = existsSync(file) ? readFileSync(file, 'utf8') : null
  assert.equal(now, before, '指紋對不上時 known_hosts 不能被改：先寫到暫存檔，比對成功才 mv 過去')
})

test('trust-host.sh：指紋對得上時寫入 known_hosts', async () => {
  const up = sh(dir, 'server/up.sh', 600_000)
  assert.equal(up.code, 0, `sh server/up.sh 失敗：${up.stderr}`)
  await waitSsh()
  const r = sh(dir, 'trust-host.sh')
  assert.equal(r.code, 0, `trust-host.sh 失敗：${r.stderr}`)
  const want = docker('exec', SERVER, 'ssh-keygen', '-lf', '/etc/ssh/ssh_host_ed25519_key.pub').stdout.split(' ')[1]
  const got = run('ssh-keygen', ['-F', '[127.0.0.1]:18060', '-f', 'known_hosts', '-l'], { cwd: dir }).stdout
  assert.ok(got.includes(want), `known_hosts 裡 [127.0.0.1]:18060 的指紋要是 ${want}（ssh-keyscan -p 18060 127.0.0.1 的輸出格式）`)
})

test('ssh -F ssh_config cafe-server whoami 用金鑰登入，得到 ubuntu', () => {
  assert.ok(config().many('identityfile').every(inside), 'IdentityFile 要指到這個資料夾的 ./keys/id_ed25519')
  const r = ssh(dir, 'whoami')
  assert.equal(r.stdout, 'ubuntu', `登入失敗：${r.stderr}\n伺服器只接受金鑰登入（密碼登入已關閉）；確認私鑰權限 600、IdentityFile 正確、known_hosts 有伺服器的主機金鑰`)
})
