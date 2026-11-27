// 練習 1：start.sh 包裝 server.mjs，docker stop 時 SIGTERM 要送到 node，優雅結束（不被逾時的 SIGKILL 殺掉）
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, inspect, removeContainers, requireDocker, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-03-sig'
let pid1 = '', stopMs = 0, c: any = null, logs = ''

before(async () => {
  requireDocker()
  removeContainers(NAME)
  const r = docker('run', '-d', '--name', NAME, '-v', `${dir}:/app`, '-p', '127.0.0.1:18030:3000', 'node:24.22.2-alpine3.24', 'sh', '/app/start.sh')
  assert.equal(r.code, 0, `容器啟動失敗：${r.stderr}`)
  try { await waitHttp('http://127.0.0.1:18030/health/live', 20_000) } catch (e) {
    throw new Error(`server 沒有起來：${(e as Error).message}\n容器的 log：\n${docker('logs', NAME).stdout}${docker('logs', NAME).stderr}`)
  }
  pid1 = docker('exec', NAME, 'cat', '/proc/1/cmdline').stdout.replaceAll('\0', ' ').trim()
  const t = Date.now()
  docker('stop', '-t', '10', NAME)
  stopMs = Date.now() - t
  c = inspect(NAME)
  const l = docker('logs', NAME)
  logs = `${l.stdout}\n${l.stderr}`
})
after(() => removeContainers(NAME))

test('容器裡的 PID 1 是 node，不是 sh', () => {
  assert.match(pid1, /^node\b/, `PID 1 現在是「${pid1}」：sh 當 PID 1 不會把 SIGTERM 轉給 node。最後一行改成 exec node server.mjs，讓 node 取代 sh`)
  assert.match(pid1, /\bserver\.mjs\b/, `PID 1 是「${pid1}」：要執行附的 server.mjs，不要換成別的程式`)
})

// 不量秒數：機器忙的時候 docker stop 本身就慢。結束碼 0 就代表沒有等到逾時被 SIGKILL（那會是 137）
test('docker stop 後結束碼 0，沒有等到逾時被 SIGKILL', () => {
  assert.ok(c, '找不到容器 ld-03-sig')
  assert.notEqual(c.State.ExitCode, 137, `結束碼 137＝被 SIGKILL：SIGTERM 沒送到 node，docker stop 等滿 10 秒才硬殺（花了 ${(stopMs / 1000).toFixed(1)} 秒）`)
  assert.equal(c.State.ExitCode, 0, `結束碼是 ${c.State.ExitCode}，server.mjs 收到 SIGTERM 會以 0 結束`)
})

test('log 有啟動時印的設定，也有 shutdown complete', () => {
  assert.match(logs, /cafe-api starting: PORT=/, '啟動時那行 echo 不要刪掉：包裝腳本先印設定，再啟動程式')
  assert.match(logs, /shutdown complete/, 'log 裡沒有 shutdown complete：node 沒收到 SIGTERM，或是在收尾前就被殺了（例如 sh 用 trap 自己先結束，node 跟著被硬殺）')
})
