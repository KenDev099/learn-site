// 練習 4：run-hardened.sh 用唯讀根檔案系統、/tmp 的 tmpfs、--cap-drop ALL、no-new-privileges 執行 learn-devops/cafe-api:09-1
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:09-1'
const NAME = 'ld-09-hardened'
let c: any = null

before(() => {
  requireDocker()
  removeContainers(NAME)
  const b = run('docker', ['build', '-t', IMAGE, 'app'], { cwd: dir, timeout: 600_000 })
  assert.equal(b.code, 0, `docker build -t ${IMAGE} app 失敗，先讓練習 1 通過：\n${b.stderr.split('\n').slice(-8).join('\n')}`)
  const r = run('sh', ['run-hardened.sh'], { cwd: dir, timeout: 120_000 })
  assert.equal(r.code, 0, `sh run-hardened.sh 失敗（結束碼 ${r.code}）：${r.stderr || r.stdout}`)
  c = inspect(NAME)
})
after(() => removeContainers(NAME))

test('容器 ld-09-hardened 在跑，映像是 learn-devops/cafe-api:09-1，只發布在 127.0.0.1:18094', () => {
  assert.ok(c, '找不到容器 ld-09-hardened：docker run 要加 --name ld-09-hardened')
  assert.equal(c.Config.Image, IMAGE)
  const b = c.HostConfig.PortBindings?.['3000/tcp']?.[0]
  assert.equal(b?.HostIp, '127.0.0.1', '用 -p 127.0.0.1:18094:3000 只發布在本機')
  assert.equal(b?.HostPort, '18094')
})

test('根檔案系統唯讀，只有 /tmp 是 tmpfs', () => {
  assert.ok(c, '容器不存在')
  assert.equal(c.HostConfig.ReadonlyRootfs, true, '加上 --read-only：容器不能改映像裡的任何檔案')
  assert.deepEqual(Object.keys(c.HostConfig.Tmpfs ?? {}), ['/tmp'], '用 --tmpfs /tmp 給一個（而且只有一個）可寫的暫存目錄')
  const mounts = (c.Mounts ?? []).map((m: any) => `${m.Type} ${m.Destination}`)
  assert.deepEqual(mounts, [], `另外掛了 ${mounts.join('、')}：不要用 -v／--mount 再開可寫的目錄，讓程式改寫到 /tmp（設定 TMP_DIR）`)
})

test('拿掉所有 capability、禁止取得新權限、不是 privileged', () => {
  assert.ok(c, '容器不存在')
  assert.deepEqual((c.HostConfig.CapDrop ?? []).map((s: string) => s.toUpperCase()), ['ALL'], '用 --cap-drop ALL 拿掉全部 capability')
  assert.ok(!(c.HostConfig.CapAdd ?? []).length, 'cafe-api 聽 3000 port，不需要加回任何 capability（--cap-add）')
  assert.equal(c.HostConfig.Privileged, false, '--privileged 等於把整台主機的權限交給容器，跟加固正好相反')
  const unconfined = (c.HostConfig.SecurityOpt ?? []).filter((s: string) => /unconfined/.test(s))
  assert.deepEqual(unconfined, [], `${unconfined.join('、')} 關掉了 Docker 預設的系統呼叫限制，跟加固正好相反`)
  assert.ok((c.HostConfig.SecurityOpt ?? []).some((s: string) => /^no-new-privileges(:true|=true)?$/.test(s)), '加上 --security-opt no-new-privileges')
})

test('以非 root 執行，/health/live 與會寫暫存檔的 POST /uploads 都成功', async () => {
  assert.ok(c?.State.Running, '容器沒有在執行：docker logs ld-09-hardened 看原因')
  const uid = docker('exec', NAME, 'node', '-p', 'process.getuid()').stdout
  assert.notEqual(uid, '0', '程式以 root 執行：不要用 --user 0 / --user root 蓋掉映像的 USER node')
  const live = await waitHttp('http://127.0.0.1:18094/health/live', 20_000)
  assert.equal(live.status, 200, 'GET /health/live 要回 200')
  const body = randomBytes(1000 + Math.floor(Math.random() * 50_000))
  const res = await fetch('http://127.0.0.1:18094/uploads', { method: 'POST', body })
  const text = await res.text()
  assert.equal(res.status, 200, `POST /uploads 失敗：${text}。app 把暫存檔寫在 TMP_DIR（預設 /home/node/uploads），唯讀的根檔案系統寫不進去：設定 -e TMP_DIR=/tmp，指到 tmpfs`)
  assert.equal(JSON.parse(text).bytes, body.length, '回傳的 bytes 要等於上傳的大小')
})
