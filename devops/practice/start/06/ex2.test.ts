// 練習 2：deploy.sh 把 app 部署到伺服器，cafe-api.service 讓 systemd 看管它
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { removeContainers, requireDocker, run, type Result } from '../../helpers/docker.ts'
import { SERVER, inServer, startServer } from './server/lab.ts'

const dir = import.meta.dirname
let d1: Result, d2: Result, pid1 = '', pid2 = '', reload = ''
// 真的雲端主機只能透過 SSH 操作：執行 deploy.sh 時把 docker 換成一個會失敗的假指令
const noDocker = mkdtempSync(join(tmpdir(), 'ld-06-nodocker-'))
writeFileSync(join(noDocker, 'docker'), "#!/bin/sh\necho 'deploy.sh 不能用 docker：真的伺服器只能透過 ssh／scp／rsync -F ssh_config cafe-server 操作' >&2\nexit 1\n")
chmodSync(join(noDocker, 'docker'), 0o755)
const deploy = () => run('sh', ['deploy.sh'], { cwd: dir, timeout: 180_000, env: { PATH: `${noDocker}:${process.env.PATH}` } })
const mainPid = () => inServer('systemctl show -p MainPID --value cafe-api').stdout
const health = () => inServer('curl -s -o /dev/stderr -w "%{http_code}" localhost:3000/health/live')

before(async () => {
  requireDocker()
  removeContainers(SERVER)
  await startServer(dir)
  d1 = deploy()
  pid1 = mainPid()
  // 模擬伺服器上 systemd 已載入的是「上一版」的 unit：第二次部署裝上的 unit 跟它不同，沒有 daemon-reload 就不會生效
  inServer("printf '\\n[Unit]\\nDocumentation=https://cafe.example/old-unit\\n' >> /etc/systemd/system/cafe-api.service && systemctl daemon-reload")
  d2 = deploy()
  pid2 = mainPid()
  reload = inServer('systemctl show -p NeedDaemonReload --value cafe-api').stdout
})
after(() => { removeContainers(SERVER); rmSync(noDocker, { recursive: true, force: true }) })

test('deploy.sh 成功，而且可以重複執行：第二次部署會用新的程式碼重新啟動', () => {
  assert.equal(d1.code, 0, `sh deploy.sh 失敗（結束碼 ${d1.code}）：${d1.stderr}\n伺服器上的 log：sudo journalctl -u cafe-api`)
  assert.equal(d2.code, 0, `第二次執行 deploy.sh 失敗：${d2.stderr}`)
  assert.equal(reload, 'no', '第二次部署後 systemd 還在用舊的 unit（NeedDaemonReload=yes）：裝好 unit 檔之後要 sudo systemctl daemon-reload')
  assert.ok(pid2 !== '0' && pid2 !== pid1, `第二次部署後 MainPID 沒有變（${pid1} → ${pid2}）：enable --now 對已經在跑的服務什麼都不做，新程式碼不會生效，部署要用 systemctl restart`)
})

test('cafe-api 是 active，而且 enabled（重開機會自己起來）', () => {
  assert.equal(inServer('systemctl is-active cafe-api').stdout, 'active', `服務沒有在跑：\n${inServer('systemctl status cafe-api --no-pager').stdout}`)
  const en = inServer('systemctl is-enabled cafe-api').stdout
  assert.equal(en, 'enabled', `systemctl is-enabled 是「${en}」：unit 要有 [Install] WantedBy=multi-user.target，部署時 systemctl enable`)
})

test('主程序以 cafe 身分執行，不是 root', () => {
  const user = inServer(`ps -o user= -p ${mainPid()}`).stdout
  assert.equal(user, 'cafe', `主程序的使用者是「${user}」：在 [Service] 加上 User=cafe`)
})

test('/etc/cafe-api.env 擁有者 root、權限 600；unit 檔裡沒有密碼', () => {
  const st = inServer('stat -c "%U %a" /etc/cafe-api.env').stdout
  assert.equal(st, 'root 600', `/etc/cafe-api.env 是「${st}」：裝的時候用 sudo install -o root -g root -m 600`)
  const pw = readFileSync(join(dir, 'cafe-api.env'), 'utf8').match(/^DB_PASSWORD=(.+)$/m)?.[1]?.trim()
  const unit = inServer('systemctl cat cafe-api').stdout
  assert.ok(!/DB_PASSWORD/.test(unit) && !(pw && unit.includes(pw)), '密碼不能寫進 unit 檔（任何人都能 systemctl cat 看到）：放在 EnvironmentFile=/etc/cafe-api.env')
})

test('/health/live 回 200，設定來自 /etc/cafe-api.env', () => {
  const h = health()
  assert.equal(h.stdout, '200', `伺服器裡 curl localhost:3000/health/live 沒有回 200：\n${inServer('journalctl -u cafe-api --no-pager -n 20').stdout}`)
  assert.equal(JSON.parse(h.stderr).dbPasswordSet, true, '程式沒有拿到 DB_PASSWORD：用 EnvironmentFile=/etc/cafe-api.env 載入設定')
  const env = 'test-' + randomBytes(3).toString('hex')
  inServer(`sed -i 's/^APP_ENV=.*/APP_ENV=${env}/' /etc/cafe-api.env && systemctl restart cafe-api`)
  let got = ''
  for (let i = 0; i < 20 && !got; i++) { const r = health(); if (r.stdout === '200') got = JSON.parse(r.stderr).env; else inServer('sleep 0.3') }
  assert.equal(got, env, `改了 /etc/cafe-api.env 的 APP_ENV 並 restart 後，程式看到的是「${got}」：設定要從 EnvironmentFile=/etc/cafe-api.env 讀，不要寫死在 unit 檔`)
})

test('主程序被 kill -9 後，5 秒內自動重新啟動', () => {
  const before = mainPid()
  inServer(`kill -9 ${before}`)
  let now = '0'
  for (let i = 0; i < 25; i++) {
    inServer('sleep 0.2')
    now = mainPid()
    if (now !== '0' && now !== before && inServer('systemctl is-active cafe-api').stdout === 'active') break
  }
  assert.ok(now !== '0' && now !== before, `kill -9 之後服務沒有回來（MainPID ${now}）：加上 Restart=on-failure 和 RestartSec=2`)
})

test('systemctl stop 優雅結束：journal 有 shutdown complete，Result=success', () => {
  inServer('systemctl stop cafe-api')
  const result = inServer('systemctl show -p Result --value cafe-api').stdout
  assert.equal(result, 'success', `停止後 Result 是 ${result}（timeout 代表等太久被 SIGKILL）：Type=exec、讓 node 收到 SIGTERM`)
  assert.match(inServer('journalctl -u cafe-api --no-pager').stdout, /shutdown complete/, 'journal 裡要看得到 node 印的 shutdown complete')
})
