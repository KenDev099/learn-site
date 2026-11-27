// 練習 3：web.sh 在背景啟動 nginx，只發布在 127.0.0.1:18010；web.json 記下回應的 Server 標頭
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, inspect, readJson, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-01-web'
let c: any = null
// 刪掉 ld-01-web，以及其他占用 18010 的容器（例如忘了加 --name 時開出來的）
const cleanup = () => removeContainers(NAME, ...docker('ps', '-aq', '--filter', 'publish=18010').stdout.split('\n').filter(Boolean))
before(() => {
  requireDocker()
  cleanup()   // 每次從乾淨的狀態開始：先刪掉上一次留下的容器
  const r = run('sh', ['web.sh'], { cwd: dir, timeout: 180_000 })
  assert.equal(r.code, 0, `sh web.sh 失敗（結束碼 ${r.code}）：${r.stderr || r.stdout}`)
  c = inspect(NAME)
})
after(cleanup)

test('web.sh 跑完後，容器 ld-01-web 還在執行', () => {
  assert.ok(c, '找不到名為 ld-01-web 的容器：docker run 要加 --name ld-01-web')
  assert.equal(c.State.Running, true, '容器已經停了：要用 -d 在背景執行')
  assert.equal(c.Config.AttachStdout, false, 'docker run 沒有加 -d：用 shell 的 & 丟到背景時，docker 指令還掛在終端機上；要用 -d（detached）讓 Docker 自己在背景跑容器')
  assert.equal(c.Config.Image.replace(/^docker\.io\/library\//, ''), 'nginx:1.30-alpine', `映像是 ${c.Config.Image}：要用寫明版本的 nginx:1.30-alpine`)
})

test('port 只發布在 127.0.0.1:18010，對到容器的 80', () => {
  assert.ok(c, '容器不存在：先讓上一個測試通過')
  const b = c.HostConfig.PortBindings?.['80/tcp']
  assert.ok(b?.length, '容器的 80 port 沒有發布出來：-p 127.0.0.1:18010:80（nginx 在容器裡聽 80）')
  assert.equal(b.length, 1, '80 port 只要發布一次')
  assert.equal(b[0].HostIp, '127.0.0.1', '沒寫主機 IP 會綁在 0.0.0.0，同一個 Wi-Fi 的人都連得到：寫成 -p 127.0.0.1:18010:80')
  assert.equal(b[0].HostPort, '18010', '主機這端的 port 是 18010')
})

test('web.json 的 server 和實際回應的 Server 標頭完全相同', async () => {
  assert.ok(c?.State.Running, '容器沒有在執行：先讓第一個測試通過')
  const res = await waitHttp('http://127.0.0.1:18010/', 15_000)
  assert.equal(res.status, 200, 'nginx 首頁要回 200')
  assert.equal(readJson(dir, 'web.json').server, res.headers.get('server'), '執行 curl -I http://localhost:18010，抄 Server: 後面的完整值（含版本）')
})
